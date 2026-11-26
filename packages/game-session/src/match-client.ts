import {
  MAX_WIRE_STROKES,
  PROTOCOL_VERSION,
  parseCastRefused,
  parsePeerRefuse,
  parsePeerRejoinChallenge,
  parsePeerSeatDropped,
  parsePeerWelcome,
  parseAdrenaline,
  parseChainMarks,
  parseRecharge,
  parseWireCalls,
  parseWireStrokes,
  parseWireMatchReplayPart,
  parseWireTraps,
  parseWireRespawns,
  parseWireCapes,
  parseWireSeatCosmetics,
  parseWireCombatBatch,
  parseWireEnded,
  parseWireMatchChartPart,
  joinMatchChart,
  parseWireSkillBar,
  parseWireWeaponSets,
  parseWireSnapshotPart,
  type AdrenalineMessage,
  type CastRefusedMessage,
  type ChainMarksMessage,
  type WireChainRole,
  type Channel,
  type ClientIntent,
  type PeerBye,
  type PeerSceneReady,
  type PeerCall,
  type PeerHello,
  type PeerRefuse,
  type PeerRejoinProof,
  type PeerWelcome,
  type RechargeMessage,
  type WireCalls,
  type WireCape,
  type WireStroke,
  type WireMatchReplayPart,
  type WireTraps,
  type WireEnded,
  type WireMatchChart,
  type WireMatchChartPart,
  type WireSkillBar,
  type WireWeaponSets,
  type WireSnapshot,
  type WireTeamCount,
} from "@vibewars/game-protocol";

import {
  NO_CALLS,
  type CallsSnapshot,
  type CombatMessage,
  type ConnectionState,
  type MatchConnection,
  type MatchSnapshot,
  type PlayerSnapshot,
  type SeatWorn,
  type SlotRecharge,
} from "./match-connection.js";
import { RECONNECT_WINDOW_SECONDS } from "./match-host.js";
import { rejoinProof } from "./rejoin-proof.js";
import { joinReplay, MAX_REPLAY_CHARS, type RecordedReplay, type Sha256 } from "./replay.js";
import { snapshotAssembler } from "./snapshot-parts.js";
import type { Transport } from "./transport.js";
import { combatMessage, matchSnapshot, playerSnapshots, wear } from "./wire.js";

/**
 * A match on another peer's browser, as the match view sees every match:
 * a `MatchConnection` (#375). Everything comes from `hostId` alone, and
 * through its validator first; anything else, from anyone, is dropped.
 *
 * The host's peer going without a word is a drop, not the end (#515): the
 * connection is `reconnecting` for the host's own `RECONNECT_WINDOW_SECONDS`,
 * and when the peer is back it asks for the seat again, and proves it
 * holds the rejoin token without sending it (#593). Only `ended` with `host-left`, a refusal, or the window running
 * out make it `lost`.
 */

/** The host turned this player away, and said why; the client words `reason`. */
export class MatchRefusedError extends Error {
  public readonly reason: PeerRefuse["reason"];

  public constructor(refusal: PeerRefuse) {
    super(`The host refused: ${refusal.reason}`);
    this.name = "MatchRefusedError";
    this.reason = refusal.reason;
  }
}

/** The host left before it let this player in. */
export class HostLeftError extends Error {
  public constructor() {
    super("The host left.");
    this.name = "HostLeftError";
  }
}

/** The host never answered. */
export class MatchTimeoutError extends Error {
  public constructor(timeoutMs: number) {
    super(`The host did not answer within ${String(timeoutMs / 1000)} s.`);
    this.name = "MatchTimeoutError";
  }
}

/**
 * How often a peer says its hello or observe again until the host answers
 * (#1805): one that arrives before the host's match listens is lost, and
 * nothing buffers it.
 */
export const HELLO_RESEND_MS = 1_000;

/** A P2P match: a `MatchConnection`, plus what it takes to come back after a drop. */
export interface PeerMatchConnection extends MatchConnection {
  /**
   * What this peer proves it holds to take this seat back; it never goes on
   * the wire. The host issues a new one with every welcome, a rejoin's too.
   */
  readonly rejoinToken: string;
}

/** What a client keeps a replay with (#3572). */
export interface ReplayKeeper {
  readonly sha256: Sha256;
  readonly keep: (recorded: RecordedReplay) => void;
}

export interface ConnectMatchOptions {
  readonly transport: Transport;
  readonly hostId: string;
  readonly hello: PeerHello;
  /** How long to wait for `welcome` and `skill-bar`. */
  readonly timeoutMs: number;
  /**
   * Where the match's replay goes (#3572), once the host has sent all of
   * it and it checks out against its hash; `null` drops it.
   */
  readonly replays: ReplayKeeper | null;
}

/**
 * `handle` each message on `channel` from `hostId`, through `parse`;
 * anything else, from anyone, is dropped. Returns what removes it.
 */
export function onFromHost<T>(
  transport: Transport,
  hostId: string,
  channel: Channel,
  parse: (value: unknown) => T | undefined,
  handle: (message: T) => void,
): () => void {
  return transport.on(channel, (data, from) => {
    if (from !== hostId) {
      return;
    }
    const message = parse(data);
    if (message !== undefined) {
      handle(message);
    }
  });
}

/**
 * `players` with each dead one's `respawnIn` from `respawns` (#3367); the
 * alive, and the dead it does not name, foes among them, keep none.
 */
export function withRespawns(
  players: readonly PlayerSnapshot[],
  respawns: ReadonlyMap<string, number | null>,
): readonly PlayerSnapshot[] {
  if (respawns.size === 0) {
    return players;
  }
  return players.map((player) =>
    player.dead && respawns.has(player.sessionId)
      ? { ...player, respawnIn: respawns.get(player.sessionId) }
      : player,
  );
}

/** A match's replay parts as they come (#3572). */
export interface ReplayParts {
  /** Every part, once `part` completes them; each part is handed out once. */
  add(part: WireMatchReplayPart): readonly WireMatchReplayPart[] | undefined;
  /** The characters held now. */
  readonly chars: number;
}

/**
 * Replay parts, never more than `MAX_REPLAY_CHARS` of them held (#3620):
 * past it, or on a part that can never join the first, they are dropped,
 * and so is every part after.
 */
export function createReplayParts(): ReplayParts {
  const parts = new Map<number, WireMatchReplayPart>();
  let chars = 0;
  let done = false;
  const drop = (): void => {
    parts.clear();
    chars = 0;
    done = true;
  };
  return {
    add(part) {
      if (done || parts.has(part.part)) {
        return undefined;
      }
      const first = parts.values().next().value;
      if (
        (first !== undefined && (first.hash !== part.hash || first.of !== part.of)) ||
        chars + part.text.length > MAX_REPLAY_CHARS
      ) {
        drop();
        return undefined;
      }
      parts.set(part.part, part);
      chars += part.text.length;
      if (parts.size < part.of) {
        return undefined;
      }
      const all = [...parts.values()];
      drop();
      return all;
    },
    get chars() {
      return chars;
    },
  };
}

/** The latest recharges, and the match time they were told at, to count down from. */
interface Recharges {
  readonly message: RechargeMessage;
  readonly at: number;
}

export function connectMatch(options: ConnectMatchOptions): Promise<PeerMatchConnection> {
  const { transport, hostId, hello, timeoutMs } = options;
  const unsubscribe: (() => void)[] = [];
  let welcomed: PeerWelcome | undefined;
  let skillBar: WireSkillBar | undefined;
  let weaponSets: WireWeaponSets | undefined;
  let latest:
    { readonly wire: WireSnapshot; readonly players: readonly PlayerSnapshot[] } | undefined;
  let ended: WireEnded | undefined;
  /** The host's summary from any `ended`, a host leaving's included (#1057). */
  let summary: WireEnded["summary"] | undefined;
  /** The parts of the host's charts so far (#3564), and the whole once they have all come. */
  const chartParts: WireMatchChartPart[] = [];
  let chart: WireMatchChart | undefined;
  let recharges: Recharges = { message: { slots: [], spent: [], queued: null }, at: 0 };
  /**
   * Your own adrenaline per slot as last sent (#463), with when its loss
   * was due, and the match time it came at (#828).
   */
  let adrenaline: { readonly message: AdrenalineMessage; readonly at: number } = {
    message: { slots: [], lossInSeconds: null },
    at: 0,
  };
  /** The chain marks you placed as last sent, and the match time they came at (#916). */
  let chain: { readonly message: ChainMarksMessage; readonly at: number } = {
    message: { marks: [] },
    at: 0,
  };
  /** Your team's calls as last sent, and the match time they came at (#443). */
  let calls: { readonly wire: WireCalls; readonly at: number } | undefined;
  /**
   * Your team's compass line segments (#2391), each with the match time
   * it came at, kept here: the host sends each once, and again after a welcome.
   */
  let strokes: { readonly wire: WireStroke; readonly at: number }[] = [];
  /** Your team's traps as last sent (#1105). */
  let traps: WireTraps["traps"] = [];
  /** When each of your team's dead comes back, as last sent (#3367), by id. */
  let respawns = new Map<string, number | null>();
  /** Each seat's cape as last sent (#3554), by id. */
  let capes = new Map<string, WireCape>();
  const worn = new Map<string, SeatWorn>();
  let lost = false;
  /** The first frame was said drawn (#3852): it goes once. */
  let sceneSent = false;
  /** When the host's peer went, by `Date.now`, while waiting for it back. */
  let droppedAt: number | undefined;
  let reconnectTimer: unknown;
  /** Says the hello again until the host answers it (#1805). */
  let helloTimer: unknown;
  /** Set once `connectMatch` has resolved or rejected. */
  let settled = false;
  let onLostWhileJoining: () => void = () => undefined;
  const combatHandlers: ((message: CombatMessage) => void)[] = [];
  const refusalHandlers: ((message: CastRefusedMessage) => void)[] = [];
  const connectionHandlers: ((state: ConnectionState) => void)[] = [];

  /** Messages on `channel` from the host, through `parse`; the rest is dropped. */
  const fromHost = <T>(
    channel: Channel,
    parse: (value: unknown) => T | undefined,
    handle: (message: T) => void,
  ): void => {
    unsubscribe.push(onFromHost(transport, hostId, channel, parse, handle));
  };

  const tell = (state: ConnectionState): void => {
    for (const handler of [...connectionHandlers]) {
      handler(state);
    }
  };

  const loseHost = (state: "lost" | "host-left" = "lost"): void => {
    if (lost) {
      return;
    }
    lost = true;
    clearTimeout(reconnectTimer);
    droppedAt = undefined;
    if (!settled) {
      onLostWhileJoining();
      return;
    }
    tell(state);
  };

  /**
   * The host's peer went. Before the welcome, the join fails, as before;
   * in a match, its seat is held for the window, so wait that long. The
   * window is measured on the clock, so a hidden tab's late timer does
   * not stretch it.
   */
  const dropHost = (): void => {
    if (lost || droppedAt !== undefined) {
      return;
    }
    if (!settled) {
      loseHost();
      return;
    }
    droppedAt = Date.now();
    reconnectTimer = setTimeout(loseHost, RECONNECT_WINDOW_SECONDS * 1000);
    tell("reconnecting");
  };

  /** The match clock: the latest snapshot's, or before the first, the welcome's. */
  const elapsed = (): number => latest?.wire.elapsedSeconds ?? welcomed?.elapsedSeconds ?? 0;

  /**
   * The teams every team on the stream is one of (#2682), the welcome's
   * map's. Before it only a host leaving counts, so the most are heard.
   */
  const teamCount = (): WireTeamCount => welcomed?.map.teamCount ?? 3;

  // A tick's snapshot comes in parts (#662); what follows sees it whole.
  const assemble = snapshotAssembler();
  // Nothing of the stream counts before the welcome: what comes earlier is
  // a match this peer watched before, its host still draining it (#480).
  fromHost(
    "snapshot",
    (value) => parseWireSnapshotPart(value, teamCount()),
    (part) => {
      if (welcomed === undefined) {
        return;
      }
      const snapshot = assemble(part);
      if (snapshot === undefined) {
        return;
      }
      // Only ever forward: one late or replayed is dropped.
      if (latest !== undefined && snapshot.tick <= latest.wire.tick) {
        return;
      }
      // One naming a status this build has no index for is malformed (#632).
      const players = playerSnapshots(snapshot, capes, worn);
      if (players !== undefined) {
        latest = { wire: snapshot, players };
      }
    },
  );
  fromHost("combat", parseWireCombatBatch, (batch) => {
    if (welcomed === undefined) {
      return;
    }
    for (const entry of batch) {
      const message = combatMessage(entry);
      for (const handler of combatHandlers) {
        handler(message);
      }
    }
  });
  fromHost("refused", parseCastRefused, (refusal) => {
    for (const handler of refusalHandlers) {
      handler(refusal);
    }
  });
  fromHost("recharge", parseRecharge, (message) => {
    recharges = { message, at: elapsed() };
  });
  fromHost("adrenaline", parseAdrenaline, (message) => {
    adrenaline = { message, at: elapsed() };
  });
  fromHost("chain", parseChainMarks, (message) => {
    chain = { message, at: elapsed() };
  });
  fromHost("calls", parseWireCalls, (message) => {
    calls = { wire: message, at: elapsed() };
  });
  fromHost("strokes", parseWireStrokes, (message) => {
    const at = elapsed();
    // A welcome's resend replaces what this peer already had of them.
    // The host keeps one team's worth live, so the newest that many are
    // all a fair host ever needs shown: a hostile one cannot pile up more.
    const ids = new Set(message.segments.map(({ id }) => id));
    strokes = [
      ...strokes.filter((kept) => !ids.has(kept.wire.id) && kept.wire.remaining > at - kept.at),
      ...message.segments.map((wire) => ({ wire, at })),
    ].slice(-MAX_WIRE_STROKES);
  });
  fromHost("traps", parseWireTraps, (message) => {
    traps = message.traps;
  });
  fromHost("respawns", parseWireRespawns, (message) => {
    respawns = new Map(message.respawns.map(({ id, respawnIn }) => [id, respawnIn]));
  });
  fromHost("cosmetics", parseWireSeatCosmetics, ({ id, ...seat }) => {
    wear(
      worn,
      id,
      seat,
      (kept) => latest?.wire.players.some((player) => player.id === kept) ?? false,
    );
  });
  fromHost("capes", parseWireCapes, (message) => {
    capes = new Map(message.capes.map(({ id, cape }) => [id, cape]));
  });
  fromHost(
    "ended",
    (value) => parseWireEnded(value, teamCount()),
    (message) => {
      if (message.endReason !== "host-left" && welcomed === undefined) {
        return;
      }
      if (message.endReason === "host-left" && ended !== undefined) {
        // The match was over before its host went: the result stands.
        lost = true;
        clearTimeout(reconnectTimer);
        return;
      }
      summary = message.summary;
      if (message.endReason === "host-left") {
        loseHost("host-left");
      } else {
        ended = message;
      }
    },
  );
  // After `ended`, its replay (#3572): kept once every part has come and it checks out.
  const replayParts = createReplayParts();
  fromHost("match-replay", parseWireMatchReplayPart, (part) => {
    const keeper = options.replays;
    if (keeper === null || ended === undefined) {
      return;
    }
    const parts = replayParts.add(part);
    if (parts === undefined) {
      return;
    }
    void joinReplay(parts, keeper.sha256).then((recorded) => {
      if (recorded !== undefined) {
        keeper.keep(recorded);
      }
    });
  });
  // Sent after `ended` on the same room, so the summary names the roster
  // the parts are checked against; a part before it is no part.
  fromHost(
    "match-chart",
    (value) =>
      ended === undefined
        ? undefined
        : parseWireMatchChartPart(value, new Set(ended.summary.map(({ id }) => id)), teamCount()),
    (part) => {
      if (chart !== undefined || chartParts.length >= part.parts) {
        return;
      }
      chartParts.push(part);
      if (chartParts.length === part.parts) {
        chart = joinMatchChart(chartParts);
      }
    },
  );
  /**
   * Ask the host for the held seat back. The host challenges, the token
   * answers it; then a welcome, or a refusal once the match is over.
   */
  const rejoin = (seat: PeerWelcome): void => {
    const message: PeerHello = { ...hello, rejoin: { playerId: seat.playerId } };
    transport.send("hello", message, hostId);
  };
  unsubscribe.push(
    transport.onPeerLeave((peerId) => {
      if (peerId === hostId) {
        dropHost();
      }
    }),
    transport.onPeerJoin((peerId) => {
      if (peerId !== hostId || droppedAt === undefined || welcomed === undefined) {
        return;
      }
      if (Date.now() - droppedAt >= RECONNECT_WINDOW_SECONDS * 1000) {
        loseHost();
        return;
      }
      rejoin(welcomed);
    }),
  );
  // A drop only the host saw (#3772): this page stalled past the
  // transport's timeout while the host carried on.
  fromHost("seat-dropped", parsePeerSeatDropped, (dropped) => {
    const seat = welcomed;
    if (lost || !settled || dropped.playerId !== seat?.playerId) {
      return;
    }
    if (dropped.expired) {
      loseHost();
      return;
    }
    // Already on the way back: one hello is enough.
    if (droppedAt !== undefined) {
      return;
    }
    dropHost();
    rejoin(seat);
  });
  fromHost("rejoin-challenge", parsePeerRejoinChallenge, (challenge) => {
    const seat = welcomed;
    if (droppedAt === undefined || lost || challenge.playerId !== seat?.playerId) {
      return;
    }
    // A peer posing as the host may have sent this: the proof names this
    // peer's own id, so it seats nobody else.
    void rejoinProof(seat.rejoinToken, challenge.nonce, seat.playerId, transport.selfId).then(
      (proof) => {
        if (droppedAt === undefined || lost || welcomed !== seat) {
          return;
        }
        const message: PeerRejoinProof = { playerId: seat.playerId, proof };
        transport.send("rejoin-proof", message, hostId);
      },
    );
  });

  const stop = (): void => {
    clearTimeout(reconnectTimer);
    clearInterval(helloTimer);
    for (const off of unsubscribe.splice(0)) {
      off();
    }
    combatHandlers.length = 0;
    refusalHandlers.length = 0;
    connectionHandlers.length = 0;
  };

  return new Promise((resolve, reject) => {
    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      stop();
      reject(error);
    };
    const timer = setTimeout(() => {
      fail(new MatchTimeoutError(timeoutMs));
    }, timeoutMs);
    onLostWhileJoining = () => {
      fail(new HostLeftError());
    };

    const connection = (welcome: PeerWelcome, bar: WireSkillBar): PeerMatchConnection => ({
      selfSessionId: welcome.playerId,
      get rejoinToken() {
        return (welcomed ?? welcome).rejoinToken;
      },
      map: welcome.map,
      timeLimitSeconds: welcome.timeLimitSeconds,
      get skillBar() {
        // The latest the host sent: it sends again when a cost changes (#637).
        return (skillBar ?? bar).slots;
      },
      ranks: new Map(Object.entries(bar.ranks)),
      get weaponSets() {
        return weaponSets;
      },
      onConnectionChange(handler) {
        connectionHandlers.push(handler);
      },
      sendIntent(intent: ClientIntent) {
        if (!lost && droppedAt === undefined) {
          transport.send("intent", intent, hostId);
        }
      },
      getSnapshot(): MatchSnapshot {
        const snapshot: MatchSnapshot =
          latest === undefined
            ? {
                selfSessionId: welcome.playerId,
                players: [],
                score: [0, 0],
                elapsedSeconds: welcome.elapsedSeconds,
                phase: "active",
                preMatch: null,
                winningTeam: undefined,
                endReason: undefined,
                projectiles: [],
                groundEffects: [],
                flags: [],
                stand: undefined,
                aggression: [],
                relics: [],
                altar: undefined,
                altarHolder: undefined,
                altarHeldSeconds: 0,
                capturePoints: [],
                gates: [],
                switches: [],
                teleports: [],
                breakables: [],
                decks: [],
                lifts: [],
                traps,
                summary,
                chart,
              }
            : {
                ...matchSnapshot(
                  latest.wire,
                  withRespawns(latest.players, respawns),
                  welcome.playerId,
                ),
                traps,
                summary,
                chart,
              };
        // An `ended` may land before the snapshot that says so.
        return ended === undefined
          ? snapshot
          : {
              ...snapshot,
              phase: "finished",
              preMatch: null,
              winningTeam: ended.winningTeam ?? undefined,
              endReason: ended.endReason,
              clearSeconds: ended.clearSeconds ?? undefined,
              teams: ended.teams,
            };
      },
      onCombat(handler) {
        combatHandlers.push(handler);
      },
      onCastRefused(handler) {
        refusalHandlers.push(handler);
      },
      getAdrenaline(): readonly number[] {
        return bar.slots.map((_, slot) => adrenaline.message.slots[slot] ?? 0);
      },
      getAdrenalineLossIn(): number | null {
        // Counted down on the match clock, as a recharge is.
        const { lossInSeconds } = adrenaline.message;
        return lossInSeconds === null
          ? null
          : Math.max(0, lossInSeconds - (elapsed() - adrenaline.at));
      },
      getChainMark(targetId: string): WireChainRole | undefined {
        // Counted down on the match clock, as a recharge is: one run out reads as none.
        const mark = chain.message.marks.find((candidate) => candidate.targetId === targetId);
        return mark !== undefined && mark.remainingSeconds - (elapsed() - chain.at) > 0
          ? mark.role
          : undefined;
      },
      getRecharges(): readonly SlotRecharge[] {
        // Counted down on the match clock: no wall time crosses the wire.
        const passed = elapsed() - recharges.at;
        return bar.slots.map((_, slot) => {
          const entry = recharges.message.slots.find((candidate) => candidate.slot === slot);
          const spent = recharges.message.spent.includes(slot);
          return entry === undefined
            ? { remaining: 0, total: 0, spent }
            : {
                remaining: Math.max(0, entry.remainingSeconds - passed),
                total: entry.totalSeconds,
                spent,
              };
        });
      },
      getQueuedSlot(): number | undefined {
        return recharges.message.queued ?? undefined;
      },
      sendCall(call: PeerCall) {
        if (!lost && droppedAt === undefined) {
          transport.send("call", call, hostId);
        }
      },
      getCalls(): CallsSnapshot {
        const now = elapsed();
        const lines = strokes.flatMap(({ wire, at }) =>
          wire.remaining - (now - at) > 0
            ? [{ ...wire, remaining: wire.remaining - (now - at) }]
            : [],
        );
        if (calls === undefined) {
          return { ...NO_CALLS, strokes: lines };
        }
        // Counted down on the match clock, as recharges are.
        const passed = now - calls.at;
        return {
          target: calls.wire.target,
          pings: calls.wire.pings.flatMap((ping) =>
            ping.remaining - passed > 0 ? [{ ...ping, remaining: ping.remaining - passed }] : [],
          ),
          strokes: lines,
        };
      },
      sceneReady() {
        if (!sceneSent) {
          sceneSent = true;
          const message: PeerSceneReady = {};
          transport.send("scene-ready", message, hostId);
        }
      },
      async disconnect() {
        stop();
        // Said first, so the host frees the seat now rather than holding
        // it for a player who is not coming back.
        const bye: PeerBye = {};
        transport.send("bye", bye, hostId);
        await transport.leave();
      },
    });

    const ready = (): void => {
      if (!settled && welcomed !== undefined && skillBar !== undefined) {
        settled = true;
        clearTimeout(timer);
        resolve(connection(welcomed, skillBar));
      }
    };

    fromHost("welcome", parsePeerWelcome, (message) => {
      // Back in the same seat after a drop: the same connection carries on.
      if (droppedAt !== undefined && message.playerId === welcomed?.playerId) {
        // Its token is the one the next drop needs.
        welcomed = message;
        clearTimeout(reconnectTimer);
        droppedAt = undefined;
        tell("online");
        return;
      }
      if (welcomed !== undefined) {
        return;
      }
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        fail(new MatchRefusedError({ reason: "protocol-mismatch" }));
        return;
      }
      welcomed = message;
      clearInterval(helloTimer);
      ready();
    });
    fromHost("skill-bar", parseWireSkillBar, (message) => {
      skillBar = message;
      ready();
    });
    fromHost("weapon-sets", parseWireWeaponSets, (message) => {
      weaponSets = message;
    });
    fromHost("refuse", parsePeerRefuse, (refusal) => {
      // A rejoin turned away: the match is over, or the seat is gone.
      if (droppedAt !== undefined) {
        loseHost();
        return;
      }
      fail(new MatchRefusedError(refusal));
    });

    transport.send("hello", hello, hostId);
    helloTimer = setInterval(() => {
      transport.send("hello", hello, hostId);
    }, HELLO_RESEND_MS);
  });
}
