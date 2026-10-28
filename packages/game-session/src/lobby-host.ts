import { DEFAULT_MATCH_RULES, type MatchRules } from "@vibewars/game-core";
import {
  MAX_LOBBY_PLAYERS,
  PROTOCOL_VERSION,
  helloProtocolVersion,
  parsePeerChat,
  parsePeerLobbyHello,
  parsePeerLobbyJoin,
  parsePeerStayTogether,
  parseWireLobbyCommand,
  type LobbyPhase,
  type PeerLobbyJoin,
  type LobbyRefusal,
  type WireChatLine,
  type WireLobbyCommand,
  type WireLobbyNote,
  type WireLobbyState,
  type WireLobbyWelcome,
  type WireMatchStart,
  type WirePartyFormed,
  type WirePartySplit,
} from "@vibewars/game-protocol";

import { MESSAGE_BURST, MESSAGES_PER_SECOND, MessageBudget } from "./intent-budget.js";
import { lobbyCharacter } from "./lobby-character.js";
import type { LobbyCharacter } from "./lobby-connection.js";
import { createLocalPeer } from "./local-peer.js";
import { RECONNECT_WINDOW_SECONDS, type MatchHost, type PlannedSeats } from "./match-host.js";
import { sanitizeChatText, sanitizeName } from "./names.js";
import { admissionDigest, type QueuedSeat } from "./queue-admission.js";
import { ticketsOf } from "./queue-formation.js";
import { scopeTransport } from "./scoped-transport.js";
import { decideStayTogether } from "./stay-together.js";
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

/**
 * Chat lines a peer may send (#479): five in five seconds, refilling one
 * a second. Its own budget, apart from the lobby's commands.
 */
export const CHAT_LINES_PER_SECOND = 1;
export const CHAT_BURST = 5;

/** A lobby's match, as the lobby hands it to whoever builds the `MatchHost`. */
export interface MatchPlan {
  readonly matchId: string;
  readonly mapId: string;
  /** Every member on a team, by peer id; spectators are not in it. */
  readonly seats: PlannedSeats;
  /** `DEFAULT_MATCH_RULES` in a coded lobby, the plan's in a queued one. */
  readonly matchRules: MatchRules;
  /** The room, for this match alone: build the `MatchHost` on it. */
  readonly transport: Transport;
}

/**
 * A lobby the Random Arena queue started (#871, #854 C5-C7): the group's
 * teams and map are fixed, only its tickets get in, each on its planned
 * team, and nobody picks or readies. Once all are seated a countdown
 * runs, then the match; not all seated by the timeout, and everyone is
 * sent off. `key` is the host's own ticket key, the group's host ticket.
 */
export interface QueuedPlan extends QueuedSeat {
  readonly matchRules: MatchRules;
  readonly countdownSeconds: number;
  /** From the lobby's start, on its clock. */
  readonly timeoutSeconds: number;
  /** The lobby timed out without the `noShows` ticket ids; it has closed. */
  readonly onFellThrough: (noShows: readonly string[]) => void;
  /**
   * How long after its match the lobby waits for the winners to say
   * whether they stay together (#882), on its clock. Only a team of more
   * than one votes.
   */
  readonly stayTogetherSeconds: number;
  /**
   * Its match is over and nobody waits on this lobby any more: the vote,
   * if there was one, is decided and its winners have left, or its window
   * ran out. Once; the caller closes the lobby.
   */
  readonly onDone: () => void;
}

export interface LobbyHostOptions {
  /** The room named by the code. */
  readonly transport: Transport;
  readonly code: string;
  /** The playable maps, from game-maps by the caller. The first is the default. */
  readonly mapIds: readonly string[];
  /** Build the match for `plan`. Injected, so a test can play a fake one. */
  readonly startMatch: (plan: MatchPlan) => MatchHost;
  /** The queue's lobby, not a coded one; its map must be one of `mapIds`. */
  readonly queued?: QueuedPlan;
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
  character: LobbyCharacter | null;
  /** The seat key it was admitted on, in a queued lobby (#882). */
  readonly seatKey: string | null;
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
  const { code, mapIds, startMatch, queued } = options;
  const [defaultMap] = mapIds;
  if (defaultMap === undefined) {
    throw new Error("a lobby needs at least one map");
  }
  if (queued !== undefined && !mapIds.includes(queued.group.mapId)) {
    throw new Error(`a queued lobby's map ${queued.group.mapId} is not one of its maps`);
  }
  if (queued !== undefined && queued.key.ticketId !== queued.group.hostTicketId) {
    throw new Error("a queued lobby is hosted by its group's host ticket");
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
  const chatBudget = new MessageBudget(CHAT_LINES_PER_SECOND, CHAT_BURST, () => undefined);
  /** Peers already told their lines are dropped, until one gets through: once a burst. */
  const throttled = new Set<string>();
  /** Peers a queued lobby has welcomed: each once, while it is here. */
  const welcomed = new Set<string>();
  /** Peers whose queued join was checked, admitted or not: each once, while it is here. */
  const judged = new Set<string>();
  let phase: LobbyPhase = "waiting";
  let mapId = queued?.group.mapId ?? defaultMap;
  let joined = 0;
  let matches = 0;
  /** The lobby's clock: the seconds `advance` was given, for the budget. */
  let elapsed = 0;
  let match:
    { readonly id: string; readonly host: MatchHost; readonly room: Transport } | undefined;
  let closed = false;
  /** A queued lobby's countdown: when it ends, in whole ms on the lobby's clock, while it runs. */
  let countdownEndsAt: number | undefined;
  /** A queued lobby starts its match once; after it, the lobby only waits. */
  let queuedStarted = false;
  /** A queued lobby's Stay together, from its match's end (#882). */
  let vote:
    | {
        readonly teamSize: number;
        /** The winning side's peers as the match ended. */
        readonly winners: readonly string[];
        readonly votes: Map<string, string | null>;
        /** Each yes's verified consent, by member key (#1078). */
        readonly consents: Map<string, string>;
        /** Winners whose consent is being checked: one vote each, still. */
        readonly checking: Set<string>;
        /** On the lobby's clock. */
        readonly endsAt: number;
        decided: boolean;
      }
    | undefined;
  /** `onDone` was called. */
  let queuedDone = false;

  const nowMs = (): number => elapsed * 1000;
  /** The clock in whole ms, so a countdown of ticks that do not add up exactly still ends. */
  const clockMs = (): number => Math.round(nowMs());

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
      character: member.character,
    })),
    countdownSeconds: countdownEndsAt === undefined ? null : countdownLeft(countdownEndsAt),
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

  /** Whole seconds left until `endsAt`. */
  const countdownLeft = (endsAt: number): number =>
    Math.max(0, Math.ceil((endsAt - clockMs()) / 1000));

  const start = (): void => {
    countdownEndsAt = undefined;
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
      const matchRules = queued?.matchRules ?? DEFAULT_MATCH_RULES;
      match = {
        id,
        host: startMatch({ matchId: id, mapId, seats, matchRules, transport: room }),
        room,
      };
    } catch {
      // The caller's to report; the lobby only has to stay usable.
      void room.leave();
      phase = "waiting";
      note("start-rejected", "the match could not be created", local.selfId);
      return;
    }
    phase = "in-match";
    queuedStarted = queued !== undefined;
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

  /** Seat `from`, which `join` brought, on `team`. */
  const admit = (
    from: string,
    join: PeerLobbyJoin,
    team: 0 | 1 | null,
    seatKey: string | null,
  ): void => {
    if (members.size >= MAX_LOBBY_PLAYERS) {
      refuse(from, "lobby-full");
      return;
    }
    joined += 1;
    members.set(from, {
      id: from,
      name: sanitizeName(join.name, `player-${String(joined)}`),
      team,
      ready: false,
      character: lobbyCharacter(join.character),
      seatKey,
    });
    beginCountdown();
    broadcast();
  };

  /** The group's seat keys no member holds. */
  const unseated = (plan: QueuedPlan): string[] => {
    const seated = new Set([...members.values()].map((member) => member.seatKey));
    return plan.group.teams.flat().filter((seatKey) => !seated.has(seatKey));
  };

  /** A queued lobby with every ticket seated counts down to its match. */
  const beginCountdown = (): void => {
    if (
      queued === undefined ||
      queuedStarted ||
      countdownEndsAt !== undefined ||
      unseated(queued).length > 0
    ) {
      return;
    }
    countdownEndsAt = clockMs() + queued.countdownSeconds * 1000;
    phase = "starting";
  };

  /** The host's proof to `to`, over the `vibewars-host` digest made for it; once. */
  const sendWelcome = (plan: QueuedPlan, hostDigest: Uint8Array, to: string): void => {
    if (welcomed.has(to)) {
      return;
    }
    welcomed.add(to);
    const welcome: WireLobbyWelcome = { hostSig: plan.key.sign(hostDigest) };
    transport.send("lobby-welcome", welcome, to);
  };

  /**
   * Welcome `from` with the host's proof, whoever it is, so even a
   * refusal comes from the planned host; then seat it on its planned team
   * if its own proof is for this host, this peer and a ticket of the
   * group nobody holds yet (ADR-0032 §6). A signature check costs
   * milliseconds, so it is the last check, and made once per peer.
   */
  const admitQueued = async (plan: QueuedPlan, join: PeerLobbyJoin, from: string) => {
    const { group, key, verifyTicketSig } = plan;
    const [hostDigest, admitDigest] = await Promise.all([
      admissionDigest("vibewars-host", group.groupId, key.ticketId, from),
      admissionDigest("vibewars-admit", group.groupId, key.ticketId, from),
    ]);
    // Settled while the digests were made: closed, or this peer gone.
    if (closed || !judged.has(from)) {
      return;
    }
    sendWelcome(plan, hostDigest, from);
    const { admission } = join;
    const team =
      admission === null
        ? undefined
        : ([0, 1] as const).find((side) => group.teams[side].includes(admission.seatKey));
    if (admission === null || team === undefined) {
      refuse(from, "not-admitted");
      return;
    }
    if ([...members.values()].some((member) => member.seatKey === admission.seatKey)) {
      refuse(from, "ticket-used");
      return;
    }
    if (!verifyTicketSig(admission.seatKey, admitDigest, admission.admissionSig)) {
      refuse(from, "not-admitted");
      return;
    }
    admit(from, join, team, admission.seatKey);
  };

  // A queued joiner asks before it joins: its proof goes only to a peer
  // whose welcome proved it this lobby's host.
  transport.on("lobby-hello", (data, from) => {
    if (
      queued === undefined ||
      closed ||
      members.has(from) ||
      !budget.take(from, nowMs()) ||
      parsePeerLobbyHello(data) === undefined
    ) {
      return;
    }
    const { group, key } = queued;
    void admissionDigest("vibewars-host", group.groupId, key.ticketId, from).then((digest) => {
      if (!closed && !members.has(from)) {
        sendWelcome(queued, digest, from);
      }
    });
  });

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
    // Back from a drop, it was admitted already: as this peer, on its ticket.
    if (returning !== undefined) {
      // Back from a drop during the match (#596): the seat it held, on its
      // team, to confirm again like everyone else when the match is over.
      away.delete(from);
      returning.name = sanitizeName(join.name, returning.name);
      returning.character = lobbyCharacter(join.character);
      returning.ready = false;
      broadcast();
      return;
    }
    if (queued !== undefined) {
      // One proof per peer while it is here: a refused one stays refused.
      if (!judged.has(from)) {
        judged.add(from);
        void admitQueued(queued, join, from);
      }
      return;
    }
    // A proof means a queued lobby, which this is not.
    if (join.admission !== null) {
      refuse(from, "not-admitted");
      return;
    }
    admit(from, join, null, null);
  });

  transport.on("lobby-cmd", (data, from) => {
    const member = members.get(from);
    // Nothing a peer says before its lobby-join counts, and in a queued
    // lobby nothing is chosen.
    if (
      closed ||
      member === undefined ||
      !budget.take(from, nowMs()) ||
      phase !== "waiting" ||
      queued !== undefined
    ) {
      return;
    }
    const command = parseWireLobbyCommand(data);
    if (command !== undefined && apply(member, command)) {
      broadcast();
    }
  });

  // Chat (#479), in the lobby and through its match, whose teams are the
  // lobby's: all chat reaches every member, spectators too; team chat
  // only the sender's team, and a spectator has none.
  transport.on("chat", (data, from) => {
    const member = members.get(from);
    if (closed || member === undefined || away.has(from)) {
      return;
    }
    if (!chatBudget.take(from, nowMs())) {
      if (!throttled.has(from)) {
        throttled.add(from);
        note("chat-throttled", "", from);
      }
      return;
    }
    throttled.delete(from);
    const chat = parsePeerChat(data);
    if (chat === undefined || (chat.channel === "team" && member.team === null)) {
      return;
    }
    const text = sanitizeChatText(chat.text);
    if (text === "") {
      return;
    }
    const line: WireChatLine = {
      channel: chat.channel,
      fromId: member.id,
      name: member.name,
      team: member.team,
      text,
    };
    for (const to of members.values()) {
      if (!away.has(to.id) && (chat.channel === "all" || to.team === member.team)) {
        transport.send("chat-line", line, to.id);
      }
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

  /** Not all seated in time: everyone is sent off, and the queue told who never came. */
  const fallThrough = (plan: QueuedPlan): void => {
    closed = true;
    note("refused", "fell-through" satisfies LobbyRefusal);
    plan.onFellThrough(ticketsOf(plan.group, unseated(plan)));
    void transport.leave();
  };

  /**
   * A queued lobby's countdown and timeout, at the lobby's clock now;
   * `shown` is the countdown everyone was last told. Whether the lobby
   * is still open.
   */
  const runQueue = (plan: QueuedPlan, shown: number | null): boolean => {
    if (queuedStarted) {
      return true;
    }
    if (countdownEndsAt === undefined) {
      if (clockMs() < plan.timeoutSeconds * 1000) {
        return true;
      }
      fallThrough(plan);
      return false;
    }
    if (clockMs() >= countdownEndsAt) {
      start();
    } else if (countdownLeft(countdownEndsAt) !== shown) {
      broadcast();
    }
    return true;
  };

  /**
   * The winners of a queued match vote on staying together, if they are
   * a team: everyone on `winningTeam` still here, who has `stayTogetherSeconds`.
   */
  const beginVote = (plan: QueuedPlan, winningTeam: 0 | 1 | null): void => {
    const teamSize = winningTeam === null ? 0 : plan.group.teams[winningTeam].length;
    vote = {
      teamSize,
      winners:
        teamSize > 1
          ? [...members.values()]
              .filter((member) => member.team === winningTeam && !away.has(member.id))
              .map((member) => member.id)
          : [],
      votes: new Map(),
      consents: new Map(),
      checking: new Set(),
      endsAt: clockMs() + plan.stayTogetherSeconds * 1000,
      // No team won, or a team of one: nothing to vote on.
      decided: teamSize <= 1,
    };
  };

  /** Decide the vote if it can be, tell those it concerns, and say when the lobby is done. */
  const runVote = (plan: QueuedPlan): void => {
    if (vote === undefined || queuedDone) {
      return;
    }
    const gone = new Set(vote.winners.filter((peerId) => !members.has(peerId)));
    const timedOut = clockMs() >= vote.endsAt;
    if (!vote.decided) {
      const decision = decideStayTogether({
        teamSize: vote.teamSize,
        winners: vote.winners,
        votes: vote.votes,
        gone,
        timedOut,
      });
      if (decision.kind !== "waiting") {
        vote.decided = true;
        const { consents } = vote;
        // Every key is a yes, and a yes counts only with its consent.
        const consentOf = (memberKey: string): string => {
          const consent = consents.get(memberKey);
          if (consent === undefined) {
            throw new Error("stay together: a member key without its consent");
          }
          return consent;
        };
        // To each yes alone: the losers share this channel. A split goes
        // to every winner here who did not say no, since a yes may still
        // be signing or being checked (#1078), and would come too late.
        const { votes } = vote;
        const told =
          decision.kind === "split"
            ? vote.winners.filter((peerId) => !gone.has(peerId) && votes.get(peerId) !== null)
            : decision.to;
        for (const to of told) {
          if (decision.kind === "formed") {
            const formed: WirePartyFormed = {
              groupId: plan.group.groupId,
              members: decision.members,
              consents: decision.members.map(consentOf),
            };
            transport.send("party-formed", formed, to);
          } else {
            transport.send("party-split", {} satisfies WirePartySplit, to);
          }
        }
      }
    }
    const waited = vote.winners.some((peerId) => peerId !== local.selfId && !gone.has(peerId));
    if (timedOut || (vote.decided && !waited)) {
      queuedDone = true;
      plan.onDone();
    }
  };

  // A winner's vote, once, while the vote is open.
  transport.on("stay-together", (data, from) => {
    if (
      queued === undefined ||
      closed ||
      vote === undefined ||
      vote.decided ||
      !vote.winners.includes(from) ||
      vote.votes.has(from) ||
      vote.checking.has(from) ||
      !budget.take(from, nowMs())
    ) {
      return;
    }
    const said = parsePeerStayTogether(data);
    if (said === undefined) {
      return;
    }
    if (said.memberKey === null) {
      vote.votes.set(from, null);
      runVote(queued);
      return;
    }
    // A yes counts only with its key's consent to this group (#1078); one
    // that does not verify is no vote, as a malformed one is.
    if (said.groupId !== queued.group.groupId) {
      return;
    }
    const open = vote;
    const { memberKey, consent } = said;
    open.checking.add(from);
    void admissionDigest("vibewars-party", said.groupId, memberKey, "").then((digest) => {
      open.checking.delete(from);
      if (
        closed ||
        vote !== open ||
        open.decided ||
        !queued.verifyTicketSig(memberKey, digest, consent)
      ) {
        return;
      }
      open.consents.set(memberKey, consent);
      open.votes.set(from, memberKey);
      runVote(queued);
    });
  });

  const host: LobbyHost = {
    local,
    advance(seconds) {
      if (closed) {
        return;
      }
      const shown = countdownEndsAt === undefined ? null : countdownLeft(countdownEndsAt);
      elapsed += seconds;
      if (queued !== undefined && !runQueue(queued, shown)) {
        return;
      }
      if (queued !== undefined) {
        runVote(queued);
      }
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
        const { winningTeam } = match.host;
        void match.room.leave();
        match = undefined;
        phase = "waiting";
        if (queued !== undefined) {
          beginVote(queued, winningTeam);
        }
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
    chatBudget.forget(peerId);
    throttled.delete(peerId);
    welcomed.delete(peerId);
    judged.delete(peerId);
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
    if (queued !== undefined) {
      // A winner gone is a no; the last of them gone, and the lobby is done.
      runVote(queued);
    }
    // A queued lobby one short waits for it again, on the clock it started with.
    if (countdownEndsAt !== undefined) {
      countdownEndsAt = undefined;
      phase = "waiting";
    }
    broadcast();
  });

  return host;
}
