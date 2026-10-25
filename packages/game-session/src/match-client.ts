import {
  PROTOCOL_MISMATCH_MESSAGE,
  PROTOCOL_VERSION,
  parseCastRefused,
  parsePeerRefuse,
  parsePeerWelcome,
  parseRecharge,
  parseWireCombatBatch,
  parseWireEnded,
  parseWireSkillBar,
  parseWireSnapshot,
  type CastRefusedMessage,
  type Channel,
  type ClientIntent,
  type PeerHello,
  type PeerRefuse,
  type PeerWelcome,
  type RechargeSlot,
  type WireEnded,
  type WireSkillBar,
  type WireSnapshot,
} from "@vibewars/game-protocol";

import type {
  CombatMessage,
  MatchConnection,
  MatchSnapshot,
  SlotRecharge,
} from "./match-connection.js";
import type { Transport } from "./transport.js";
import { combatMessage, matchSnapshot } from "./wire.js";

/**
 * A match on another peer's browser, as the match view sees every match:
 * a `MatchConnection` (#375). Everything comes from `hostId` alone, and
 * through its validator first; anything else, from anyone, is dropped.
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
  /** What to send in `PeerHello.rejoin` to take this seat back. */
  readonly rejoinToken: string;
}

export interface ConnectMatchOptions {
  readonly transport: Transport;
  readonly hostId: string;
  readonly hello: PeerHello;
  /** How long to wait for `welcome` and `skill-bar`. */
  readonly timeoutMs: number;
}

/** The latest recharges, and the match time they were told at, to count down from. */
interface Recharges {
  readonly slots: readonly RechargeSlot[];
  readonly at: number;
}

export function connectMatch(options: ConnectMatchOptions): Promise<PeerMatchConnection> {
  const { transport, hostId, hello, timeoutMs } = options;
  const unsubscribe: (() => void)[] = [];
  let welcomed: PeerWelcome | undefined;
  let skillBar: WireSkillBar | undefined;
  let latest: WireSnapshot | undefined;
  let ended: WireEnded | undefined;
  let recharges: Recharges = { slots: [], at: 0 };
  let lost = false;
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
    unsubscribe.push(
      transport.on(channel, (data, from) => {
        if (from !== hostId) {
          return;
        }
        const message = parse(data);
        if (message !== undefined) {
          handle(message);
        }
      }),
    );
  };

  const loseHost = (): void => {
    if (lost) {
      return;
    }
    lost = true;
    if (!settled) {
      onLostWhileJoining();
      return;
    }
    for (const handler of connectionHandlers) {
      handler("lost");
    }
  };

  const elapsed = (): number => latest?.elapsedSeconds ?? 0;

  fromHost("snapshot", parseWireSnapshot, (snapshot) => {
    // Only ever forward: one late or replayed is dropped.
    if (latest === undefined || snapshot.tick > latest.tick) {
      latest = snapshot;
    }
  });
  fromHost("combat", parseWireCombatBatch, (batch) => {
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
    recharges = { slots: message.slots, at: elapsed() };
  });
  fromHost("ended", parseWireEnded, (message) => {
    if (message.endReason === "host-left") {
      loseHost();
    } else {
      ended = message;
    }
  });
  unsubscribe.push(
    transport.onPeerLeave((peerId) => {
      if (peerId === hostId) {
        loseHost();
      }
    }),
  );

  const stop = (): void => {
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
      rejoinToken: welcome.rejoinToken,
      map: welcome.map,
      skillBar: bar.slots,
      onConnectionChange(handler) {
        connectionHandlers.push(handler);
      },
      sendIntent(intent: ClientIntent) {
        if (!lost) {
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
                elapsedSeconds: 0,
                phase: "active",
                winningTeam: undefined,
                endReason: undefined,
                projectiles: [],
              }
            : matchSnapshot(latest, welcome.playerId);
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
      getRecharges(): readonly SlotRecharge[] {
        // Counted down on the match clock: no wall time crosses the wire.
        const passed = elapsed() - recharges.at;
        return bar.slots.map((_, slot) => {
          const entry = recharges.slots.find((candidate) => candidate.slot === slot);
          return entry === undefined
            ? { remaining: 0, total: 0 }
            : {
                remaining: Math.max(0, entry.remainingSeconds - passed),
                total: entry.totalSeconds,
              };
        });
      },
      async disconnect() {
        stop();
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
    fromHost("refuse", parsePeerRefuse, (refusal) => {
      fail(new MatchRefusedError(refusal));
    });

    transport.send("hello", hello, hostId);
  });
}
