import {
  PROTOCOL_MISMATCH_MESSAGE,
  PROTOCOL_VERSION,
  parseCastRefused,
  parsePeerRefuse,
  parsePeerRejoinChallenge,
  parsePeerWelcome,
  parseAdrenaline,
  parseChainMarks,
  parseRecharge,
  parseWireCalls,
  parseWireTraps,
  parseWireCombatBatch,
  parseWireEnded,
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
  type PeerCall,
  type PeerHello,
  type PeerRefuse,
  type PeerRejoinProof,
  type PeerWelcome,
  type RechargeMessage,
  type WireCalls,
  type WireTraps,
  type WireEnded,
  type WireSkillBar,
  type WireWeaponSets,
  type WireSnapshot,
} from "@vibewars/game-protocol";

import {
  NO_CALLS,
  type CallsSnapshot,
  type CombatMessage,
  type MatchConnection,
  type MatchSnapshot,
  type PlayerSnapshot,
  type SlotRecharge,
} from "./match-connection.js";
import { RECONNECT_WINDOW_SECONDS } from "./match-host.js";
import { rejoinProof } from "./rejoin-proof.js";
import { snapshotAssembler } from "./snapshot-parts.js";
import type { Transport } from "./transport.js";
import { combatMessage, matchSnapshot, playerSnapshots } from "./wire.js";

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

/** The host turned this player away, and said why. */
export class MatchRefusedError extends Error {
  public readonly reason: PeerRefuse["reason"];

  public constructor(refusal: PeerRefuse) {
    super(refusal.message);
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

/** A P2P match: a `MatchConnection`, plus what it takes to come back after a drop. */
export interface PeerMatchConnection extends MatchConnection {
  /**
   * What this peer proves it holds to take this seat back; it never goes on
   * the wire. The host issues a new one with every welcome, a rejoin's too.
   */
  readonly rejoinToken: string;
}

export interface ConnectMatchOptions {
  readonly transport: Transport;
  readonly hostId: string;
  readonly hello: PeerHello;
  /** How long to wait for `welcome` and `skill-bar`. */
  readonly timeoutMs: number;
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
  let recharges: Recharges = { message: { slots: [], spent: [] }, at: 0 };
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
  /** Your team's traps as last sent (#1105). */
  let traps: WireTraps["traps"] = [];
  let lost = false;
  /** When the host's peer went, by `Date.now`, while waiting for it back. */
  let droppedAt: number | undefined;
  let reconnectTimer: unknown;
  /** Set once `connectMatch` has resolved or rejected. */
  let settled = false;
  let onLostWhileJoining: () => void = () => undefined;
  const combatHandlers: ((message: CombatMessage) => void)[] = [];
  const refusalHandlers: ((message: CastRefusedMessage) => void)[] = [];
  const connectionHandlers: ((state: "online" | "reconnecting" | "lost") => void)[] = [];

  /** Messages on `channel` from the host, through `parse`; the rest is dropped. */
  const fromHost = <T>(
    channel: Channel,
    parse: (value: unknown) => T | undefined,
    handle: (message: T) => void,
  ): void => {
    unsubscribe.push(onFromHost(transport, hostId, channel, parse, handle));
  };

  const tell = (state: "online" | "reconnecting" | "lost"): void => {
    for (const handler of [...connectionHandlers]) {
      handler(state);
    }
  };

  const loseHost = (): void => {
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
    tell("lost");
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

  // A tick's snapshot comes in parts (#662); what follows sees it whole.
  const assemble = snapshotAssembler();
  // Nothing of the stream counts before the welcome: what comes earlier is
  // a match this peer watched before, its host still draining it (#480).
  fromHost("snapshot", parseWireSnapshotPart, (part) => {
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
    const players = playerSnapshots(snapshot);
    if (players !== undefined) {
      latest = { wire: snapshot, players };
    }
  });
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
  fromHost("traps", parseWireTraps, (message) => {
    traps = message.traps;
  });
  fromHost("ended", parseWireEnded, (message) => {
    if (message.endReason !== "host-left" && welcomed === undefined) {
      return;
    }
    summary = message.summary;
    if (message.endReason === "host-left") {
      loseHost();
    } else {
      ended = message;
    }
  });
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
      // The host challenges, the token answers it; then a welcome, or a
      // refusal once the match is over.
      const rejoin: PeerHello = { ...hello, rejoin: { playerId: welcomed.playerId } };
      transport.send("hello", rejoin, hostId);
    }),
  );
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
                scoreTeam0: 0,
                scoreTeam1: 0,
                elapsedSeconds: welcome.elapsedSeconds,
                phase: "active",
                winningTeam: undefined,
                endReason: undefined,
                projectiles: [],
                groundEffects: [],
                flags: [],
                stand: undefined,
                aggression: [],
                relics: [],
                altar: undefined,
                traps,
                summary,
              }
            : { ...matchSnapshot(latest.wire, latest.players, welcome.playerId), traps, summary };
        // An `ended` may land before the snapshot that says so.
        return ended === undefined
          ? snapshot
          : {
              ...snapshot,
              phase: "finished",
              winningTeam: ended.winningTeam ?? undefined,
              endReason: ended.endReason,
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
      sendCall(call: PeerCall) {
        if (!lost && droppedAt === undefined) {
          transport.send("call", call, hostId);
        }
      },
      getCalls(): CallsSnapshot {
        if (calls === undefined) {
          return NO_CALLS;
        }
        // Counted down on the match clock, as recharges are.
        const passed = elapsed() - calls.at;
        return {
          target: calls.wire.target,
          pings: calls.wire.pings.flatMap((ping) =>
            ping.remaining - passed > 0 ? [{ ...ping, remaining: ping.remaining - passed }] : [],
          ),
        };
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
        fail(
          new MatchRefusedError({
            reason: "protocol-mismatch",
            message: PROTOCOL_MISMATCH_MESSAGE,
          }),
        );
        return;
      }
      welcomed = message;
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
  });
}
