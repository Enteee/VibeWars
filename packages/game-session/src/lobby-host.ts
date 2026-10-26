import {
  MAX_LOBBY_PLAYERS,
  PROTOCOL_VERSION,
  helloProtocolVersion,
  parsePeerLobbyJoin,
  parseWireLobbyCommand,
  type LobbyPhase,
  type LobbyRefusal,
  type WireLobbyCommand,
  type WireLobbyNote,
  type WireLobbyState,
  type WireMatchStart,
} from "@vibewars/game-protocol";

import { MESSAGE_BURST, MESSAGES_PER_SECOND, MessageBudget } from "./intent-budget.js";
import { createLocalPeer } from "./local-peer.js";
import { RECONNECT_WINDOW_SECONDS, type MatchHost, type PlannedSeats } from "./match-host.js";
import { sanitizeName } from "./names.js";
import { scopeTransport } from "./scoped-transport.js";
import { sizeChecked, type Transport } from "./transport.js";

/**
 * The pre-match lobby, hosted in one player's browser (#15, #379): the
 * server's lobby room over a `Transport`. Peers say `lobby-join` to come
 * in, send `lobby-cmd`s, and get the whole lobby back on every change.
 * The host's own player is one more peer (`createLocalPeer`), and the
 * lobby's host is its match's host: when it goes, the lobby ends.
 *
 * Nothing here reads a clock: whoever drives it calls `advance`, which
 * runs the match while there is one.
 */

/** A lobby's match, as the lobby hands it to whoever builds the `MatchHost`. */
export interface MatchPlan {
  readonly matchId: string;
  readonly mapId: string;
  /** Every member on a team, by peer id; spectators are not in it. */
  readonly seats: PlannedSeats;
  /** The room, for this match alone: build the `MatchHost` on it. */
  readonly transport: Transport;
}

export interface LobbyHostOptions {
  /** The room named by the code. */
  readonly transport: Transport;
  readonly code: string;
  /** The playable maps, from game-maps by the caller. The first is the default. */
  readonly mapIds: readonly string[];
  /** Build the match for `plan`. Injected, so a test can play a fake one. */
  readonly startMatch: (plan: MatchPlan) => MatchHost;
}

export interface LobbyHost {
  /** The host's own player's side of the room: it joins the lobby, and plays, through this. */
  readonly local: Transport;
  /** Run `seconds` of the lobby's match, if one is on, and notice when it ends. */
  advance(seconds: number): void;
  /** Send everyone off, end the match if one is on, and leave the room. */
  close(): Promise<void>;
}

interface Member {
  readonly id: string;
  name: string;
  team: 0 | 1 | null;
  ready: boolean;
}

/** Whether the lobby satisfies the rules for starting, and if not, why. */
export function canStart(
  players: readonly { readonly team: 0 | 1 | null; readonly ready: boolean }[],
): { ok: true } | { ok: false; reason: string } {
  const assigned = players.filter((player) => player.team !== null);
  if (assigned.length === 0) {
    return { ok: false, reason: "nobody has joined a team" };
  }
  if (!assigned.every((player) => player.ready)) {
    return { ok: false, reason: "not everyone on a team is ready" };
  }
  return { ok: true };
}

export function createLobbyHost(options: LobbyHostOptions): LobbyHost {
  const { code, mapIds, startMatch } = options;
  const [defaultMap] = mapIds;
  if (defaultMap === undefined) {
    throw new Error("a lobby needs at least one map");
  }
  // Its match is on a scope of this room, so this checks every message the
  // host sends, the match's too.
  const { host: transport, local } = createLocalPeer(sizeChecked(options.transport));
  /** In the order they joined, which is the order they are listed in. */
  const members = new Map<string, Member>();
  /**
   * Members whose peer left during a match (#596), and when, on the
   * lobby's clock: their seat is held, team and all, for the match's
   * reconnect window or until the match ends, whichever is first.
   */
  const away = new Map<string, number>();
  const budget = new MessageBudget(MESSAGES_PER_SECOND, MESSAGE_BURST, () => undefined);
  let phase: LobbyPhase = "waiting";
  let mapId = defaultMap;
  let joined = 0;
  let matches = 0;
  /** The lobby's clock: the seconds `advance` was given, for the budget. */
  let elapsed = 0;
  let match:
    { readonly id: string; readonly host: MatchHost; readonly room: Transport } | undefined;
  let closed = false;

  const nowMs = (): number => elapsed * 1000;

  const state = (): WireLobbyState => ({
    code,
    phase,
    mapId,
    hostId: transport.selfId,
    matchId: match?.id ?? null,
    players: [...members.values()].map((member) => ({
      id: member.id,
      name: member.name,
      team: member.team,
      ready: member.ready,
      isHost: member.id === local.selfId,
    })),
  });

  const broadcast = (): void => {
    transport.send("lobby-state", state());
  };

  const note = (kind: WireLobbyNote["kind"], reason: string, to?: string): void => {
    const message: WireLobbyNote = { kind, reason };
    transport.send("lobby-note", message, to);
  };

  const refuse = (peerId: string, reason: LobbyRefusal): void => {
    note("refused", reason, peerId);
  };

  const start = (): void => {
    phase = "starting";
    matches += 1;
    const id = `match-${String(matches)}`;
    const seats: PlannedSeats = new Map(
      [...members.values()].flatMap((member) =>
        member.team === null ? [] : [[member.id, { team: member.team, name: member.name }]],
      ),
    );
    const room = scopeTransport(transport);
    try {
      match = { id, host: startMatch({ matchId: id, mapId, seats, transport: room }), room };
    } catch {
      // The caller's to report; the lobby only has to stay usable.
      void room.leave();
      phase = "waiting";
      note("start-rejected", "the match could not be created", local.selfId);
      return;
    }
    phase = "in-match";
    // The state first: a peer takes a match-start only for the match the
    // lobby says is on, and each peer's messages arrive in order.
    broadcast();
    const message: WireMatchStart = { mapId, matchId: id };
    for (const peerId of seats.keys()) {
      transport.send("match-start", message, peerId);
    }
  };

  /** Apply `command` from `member`; whether anything changed. */
  const apply = (member: Member, command: WireLobbyCommand): boolean => {
    switch (command.kind) {
      case "choose-team":
        if (member.team === command.team) {
          return false;
        }
        member.team = command.team;
        // A player re-confirms after the side they agreed to has changed.
        member.ready = false;
        return true;
      case "ready": {
        // A spectator cannot be ready: readiness is about being in the match.
        const ready = command.ready && member.team !== null;
        const changed = member.ready !== ready;
        member.ready = ready;
        return changed;
      }
      case "select-map":
        // The host decides what maps exist, and only its own player picks.
        if (member.id !== local.selfId || !mapIds.includes(command.mapId)) {
          return false;
        }
        mapId = command.mapId;
        // A map change can undo what players agreed to, so everyone re-confirms.
        for (const other of members.values()) {
          other.ready = false;
        }
        return true;
      case "start": {
        if (member.id !== local.selfId) {
          return false;
        }
        const check = canStart([...members.values()]);
        if (check.ok) {
          start();
        } else {
          note("start-rejected", check.reason, member.id);
        }
        return false;
      }
    }
  };

  transport.on("lobby-join", (data, from) => {
    if (closed || !budget.take(from, nowMs()) || (members.has(from) && !away.has(from))) {
      return;
    }
    // Checked first: a peer of another version is told so, rather than
    // left waiting for a state that never lists it.
    if (helloProtocolVersion(data) !== PROTOCOL_VERSION) {
      refuse(from, "protocol-mismatch");
      return;
    }
    const join = parsePeerLobbyJoin(data);
    if (join === undefined) {
      return;
    }
    const returning = members.get(from);
    if (returning !== undefined) {
      // Back from a drop during the match (#596): the seat it held, on its
      // team, to confirm again like everyone else when the match is over.
      away.delete(from);
      returning.name = sanitizeName(join.name, returning.name);
      returning.ready = false;
      broadcast();
      return;
    }
    if (members.size >= MAX_LOBBY_PLAYERS) {
      refuse(from, "lobby-full");
      return;
    }
    joined += 1;
    members.set(from, {
      id: from,
      name: sanitizeName(join.name, `player-${String(joined)}`),
      team: null,
      ready: false,
    });
    broadcast();
  });

  transport.on("lobby-cmd", (data, from) => {
    const member = members.get(from);
    // Nothing a peer says before its lobby-join counts.
    if (closed || member === undefined || !budget.take(from, nowMs()) || phase !== "waiting") {
      return;
    }
    const command = parseWireLobbyCommand(data);
    if (command !== undefined && apply(member, command)) {
      broadcast();
    }
  });

  /** Forget the away members `gone` picks; whether there were any. */
  const dropAway = (gone: (leftAt: number) => boolean): boolean => {
    let dropped = false;
    for (const [peerId, leftAt] of away) {
      if (gone(leftAt)) {
        away.delete(peerId);
        members.delete(peerId);
        dropped = true;
      }
    }
    return dropped;
  };

  const host: LobbyHost = {
    local,
    advance(seconds) {
      if (closed) {
        return;
      }
      elapsed += seconds;
      // Not back within the match's own window: its seat there is gone too.
      if (dropAway((leftAt) => nowMs() - leftAt >= RECONNECT_WINDOW_SECONDS * 1000)) {
        broadcast();
      }
      if (match === undefined) {
        return;
      }
      match.host.advance(seconds);
      // Over, or everyone walked out of it: either way, back to the lobby.
      if (match.host.phase === "finished" || match.host.abandoned) {
        // Back to the lobby: teams kept, so sides are not re-picked every
        // round, and ready cleared, so nobody is dragged into a match
        // they did not confirm.
        void match.room.leave();
        match = undefined;
        phase = "waiting";
        // Whoever is still away is not coming back to this lobby.
        dropAway(() => true);
        for (const member of members.values()) {
          member.ready = false;
        }
        broadcast();
      }
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      const ending = match;
      match = undefined;
      if (ending !== undefined) {
        await ending.host.close("host-left");
      }
      note("refused", "host-left" satisfies LobbyRefusal);
      await transport.leave();
    },
  };

  transport.onPeerLeave((peerId) => {
    budget.forget(peerId);
    if (peerId === local.selfId) {
      // The host's own player went: there is no lobby without its host.
      void host.close();
      return;
    }
    if (closed || !members.has(peerId)) {
      return;
    }
    // During a match a drop may be a blip (#515, #596): the entry stays,
    // still listed, until the peer is back, the window runs out or the
    // match ends. Outside one, it goes now.
    if (match !== undefined) {
      away.set(peerId, nowMs());
      return;
    }
    members.delete(peerId);
    broadcast();
  });

  return host;
}
