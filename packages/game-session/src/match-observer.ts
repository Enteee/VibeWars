import {
  PROTOCOL_MISMATCH_MESSAGE,
  PROTOCOL_VERSION,
  parsePeerObserving,
  parsePeerRefuse,
  parseWireCombatBatch,
  parseWireEnded,
  parseWireSnapshotPart,
  type Channel,
  type MapDescriptor,
  type PeerBye,
  type PeerObserve,
  type PeerObserving,
  type WireEnded,
  type WireSnapshot,
} from "@vibewars/game-protocol";

import type { CombatMessage, ObservedSnapshot, PlayerSnapshot } from "./match-connection.js";
import {
  HELLO_RESEND_MS,
  HostLeftError,
  MatchRefusedError,
  MatchTimeoutError,
  onFromHost,
} from "./match-client.js";
import { snapshotAssembler } from "./snapshot-parts.js";
import type { Transport } from "./transport.js";
import { combatMessage, observedSnapshot, playerSnapshots } from "./wire.js";

/**
 * A lobby spectator watching the lobby's match (#480): the same snapshots,
 * combat and end a player is sent, `delaySeconds` late. It has no seat, so
 * nothing to send but its goodbye, and none of a seat's own channels.
 *
 * The host's peer going is the end of it: a viewer holds no seat to come
 * back to, and watches again by observing again.
 */
export interface ObserverConnection {
  readonly map: MapDescriptor;
  readonly timeLimitSeconds: number;
  /** How far behind the match everything this shows is. */
  readonly delaySeconds: number;
  /** The match as it stood `delaySeconds` ago; `undefined` until its first snapshot comes. */
  getSnapshot(): ObservedSnapshot | undefined;
  onCombat(handler: (message: CombatMessage) => void): void;
  /** The host is gone, or said it left: there is nothing more to watch. */
  onLost(handler: () => void): void;
  disconnect(): Promise<void>;
}

export interface ConnectObserverOptions {
  readonly transport: Transport;
  readonly hostId: string;
  /** The lobby's match to watch: the host refuses any other. */
  readonly matchId: string;
  /** How long to wait for `observing`. */
  readonly timeoutMs: number;
}

export function connectObserver(options: ConnectObserverOptions): Promise<ObserverConnection> {
  const { transport, hostId, matchId, timeoutMs } = options;
  const unsubscribe: (() => void)[] = [];
  let latest:
    { readonly wire: WireSnapshot; readonly players: readonly PlayerSnapshot[] } | undefined;
  let ended: WireEnded | undefined;
  let lost = false;
  /** Set once `connectObserver` has resolved or rejected. */
  let settled = false;
  /** Says the observe again until the host answers it (#1805). */
  let observeTimer: unknown;
  let onLostWhileJoining: () => void = () => undefined;
  const combatHandlers: ((message: CombatMessage) => void)[] = [];
  const lostHandlers: (() => void)[] = [];

  const fromHost = <T>(
    channel: Channel,
    parse: (value: unknown) => T | undefined,
    handle: (message: T) => void,
  ): void => {
    unsubscribe.push(onFromHost(transport, hostId, channel, parse, handle));
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
    for (const handler of [...lostHandlers]) {
      handler();
    }
  };

  // A tick's snapshot comes in parts (#662); what follows sees it whole.
  const assemble = snapshotAssembler();
  // Nothing of the stream counts before `observing`: what comes earlier is
  // a match this peer watched before, its host still draining it (#480).
  fromHost("snapshot", parseWireSnapshotPart, (part) => {
    if (!settled) {
      return;
    }
    const snapshot = assemble(part);
    // Only ever forward: one late or replayed is dropped.
    if (snapshot === undefined || (latest !== undefined && snapshot.tick <= latest.wire.tick)) {
      return;
    }
    // One naming a status this build has no index for is malformed (#632).
    const players = playerSnapshots(snapshot);
    if (players !== undefined) {
      latest = { wire: snapshot, players };
    }
  });
  fromHost("combat", parseWireCombatBatch, (batch) => {
    if (!settled) {
      return;
    }
    for (const entry of batch) {
      const message = combatMessage(entry);
      for (const handler of combatHandlers) {
        handler(message);
      }
    }
  });
  fromHost("ended", parseWireEnded, (message) => {
    if (message.endReason === "host-left") {
      loseHost();
    } else if (settled) {
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
    clearInterval(observeTimer);
    for (const off of unsubscribe.splice(0)) {
      off();
    }
    combatHandlers.length = 0;
    lostHandlers.length = 0;
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

    const connection = (observing: PeerObserving): ObserverConnection => ({
      map: observing.map,
      timeLimitSeconds: observing.timeLimitSeconds,
      delaySeconds: observing.delaySeconds,
      getSnapshot(): ObservedSnapshot | undefined {
        if (latest === undefined) {
          return undefined;
        }
        const snapshot: ObservedSnapshot = {
          ...observedSnapshot(latest.wire, latest.players),
          summary: ended?.summary,
        };
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
      onLost(handler) {
        lostHandlers.push(handler);
      },
      async disconnect() {
        stop();
        // Said first, so the host stops sending now rather than when it
        // sees this peer leave.
        const bye: PeerBye = {};
        transport.send("bye", bye, hostId);
        await transport.leave();
      },
    });

    fromHost("observing", parsePeerObserving, (message) => {
      if (settled) {
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
      settled = true;
      clearTimeout(timer);
      clearInterval(observeTimer);
      resolve(connection(message));
    });
    fromHost("refuse", parsePeerRefuse, (refusal) => {
      fail(new MatchRefusedError(refusal));
    });

    const observe: PeerObserve = { protocolVersion: PROTOCOL_VERSION, matchId };
    transport.send("observe", observe, hostId);
    observeTimer = setInterval(() => {
      transport.send("observe", observe, hostId);
    }, HELLO_RESEND_MS);
  });
}
