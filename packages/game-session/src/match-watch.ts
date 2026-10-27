import {
  PROTOCOL_MISMATCH_MESSAGE,
  PROTOCOL_VERSION,
  parsePeerRefuse,
  parsePeerWatching,
  parseWireCombatBatch,
  parseWireEnded,
  parseWireSnapshotPart,
  type Channel,
  type MapDescriptor,
  type PeerBye,
  type PeerWatch,
  type PeerWatching,
  type WireEnded,
  type WireSnapshot,
} from "@vibewars/game-protocol";

import { HostLeftError, MatchRefusedError, MatchTimeoutError } from "./match-client.js";
import type { CombatMessage, MatchSnapshot, PlayerSnapshot } from "./match-connection.js";
import { snapshotAssembler } from "./snapshot-parts.js";
import type { Transport } from "./transport.js";
import { combatMessage, matchSnapshot, playerSnapshots } from "./wire.js";

/**
 * A match watched from no seat (#480): what the host sends its players,
 * `delaySeconds` late, and nothing this peer could send that the host
 * would apply. Everything comes from `hostId` alone, through its
 * validator first.
 *
 * Simpler than a player's connection: an observer holds no seat, so a
 * host that goes is the end of it, not a drop to wait out.
 */
export interface WatchConnection {
  readonly map: MapDescriptor;
  /** How far behind the match this view is. */
  readonly delaySeconds: number;
  /** The match as it stood `delaySeconds` ago. `selfSessionId` names nobody. */
  getSnapshot(): MatchSnapshot;
  onCombat(handler: (message: CombatMessage) => void): void;
  /** Once, when the host is gone or the match is over for this peer. */
  onLost(handler: () => void): void;
  disconnect(): Promise<void>;
}

export interface WatchMatchOptions {
  readonly transport: Transport;
  readonly hostId: string;
  /** How long to wait for `watching`. */
  readonly timeoutMs: number;
}

/** The `selfSessionId` of a watched snapshot: no player's id is empty. */
const NOBODY = "";

export function watchMatch(options: WatchMatchOptions): Promise<WatchConnection> {
  const { transport, hostId, timeoutMs } = options;
  const unsubscribe: (() => void)[] = [];
  let watching: PeerWatching | undefined;
  let latest:
    { readonly wire: WireSnapshot; readonly players: readonly PlayerSnapshot[] } | undefined;
  let ended: WireEnded | undefined;
  let lost = false;
  let settled = false;
  let onLostWhileJoining: () => void = () => undefined;
  const combatHandlers: ((message: CombatMessage) => void)[] = [];
  const lostHandlers: (() => void)[] = [];

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

  const stop = (): void => {
    for (const off of unsubscribe.splice(0)) {
      off();
    }
    combatHandlers.length = 0;
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
    const handlers = lostHandlers.splice(0);
    stop();
    for (const handler of handlers) {
      handler();
    }
  };

  const assemble = snapshotAssembler();
  fromHost("snapshot", parseWireSnapshotPart, (part) => {
    const snapshot = assemble(part);
    // Only ever forward: one late or replayed is dropped.
    if (snapshot === undefined || (latest !== undefined && snapshot.tick <= latest.wire.tick)) {
      return;
    }
    const players = playerSnapshots(snapshot);
    if (players !== undefined) {
      latest = { wire: snapshot, players };
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

    const connection = (message: PeerWatching): WatchConnection => ({
      map: message.map,
      delaySeconds: message.delaySeconds,
      getSnapshot(): MatchSnapshot {
        const snapshot: MatchSnapshot =
          latest === undefined
            ? {
                selfSessionId: NOBODY,
                players: [],
                scoreTeam0: 0,
                scoreTeam1: 0,
                elapsedSeconds: message.elapsedSeconds,
                phase: "active",
                winningTeam: undefined,
                endReason: undefined,
                projectiles: [],
              }
            : matchSnapshot(latest.wire, latest.players, NOBODY);
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
        lost = true;
        lostHandlers.length = 0;
        stop();
        // Said first, so the host stops sending at once.
        const bye: PeerBye = {};
        transport.send("bye", bye, hostId);
        await transport.leave();
      },
    });

    fromHost("watching", parsePeerWatching, (message) => {
      if (watching !== undefined || settled) {
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
      watching = message;
      settled = true;
      clearTimeout(timer);
      resolve(connection(message));
    });
    fromHost("refuse", parsePeerRefuse, (refusal) => {
      fail(new MatchRefusedError(refusal));
    });

    const watch: PeerWatch = { protocolVersion: PROTOCOL_VERSION };
    transport.send("watch", watch, hostId);
  });
}
