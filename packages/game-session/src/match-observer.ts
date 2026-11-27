import {
  PROTOCOL_VERSION,
  parsePeerObserving,
  parsePeerRefuse,
  parseWireCapes,
  parseWireSeatCosmetics,
  parseWireCombatBatch,
  parseWireEnded,
  parseWireSnapshotPart,
  type Channel,
  type MapDescriptor,
  type PeerBye,
  type PeerObserve,
  type PeerObserving,
  type WireCape,
  type WireEnded,
  type WireSnapshot,
  type WireTeamCount,
} from "@vibewars/game-protocol";

import type {
  CombatMessage,
  ConnectionState,
  ObservedSnapshot,
  PlayerSnapshot,
  SeatWorn,
} from "./match-connection.js";
import {
  HELLO_RESEND_MS,
  HostLeftError,
  MatchRefusedError,
  MatchTimeoutError,
  onFromHost,
} from "./match-client.js";
import { RECONNECT_WINDOW_SECONDS } from "./match-host.js";
import { snapshotAssembler } from "./snapshot-parts.js";
import type { Transport } from "./transport.js";
import { combatMessage, observedSnapshot, playerSnapshots, wear } from "./wire.js";

/**
 * A lobby spectator watching the lobby's match (#480): the same snapshots,
 * combat and end a player is sent, `delaySeconds` late. It has no seat, so
 * nothing to send but its goodbye, and none of a seat's own channels.
 *
 * The host's peer going is waited out as a player's seat waits it out
 * (#4105): `RECONNECT_WINDOW_SECONDS` for it to be heard again, and then
 * the same observe said again. Past the window, it is the end of it.
 * Before `observing` it fails nothing (#4115): the observe goes on being
 * said, at once when the host is heard again, until `timeoutMs`.
 */
export interface ObserverConnection {
  readonly map: MapDescriptor;
  readonly timeLimitSeconds: number;
  /** How far behind the match everything this shows is. */
  readonly delaySeconds: number;
  /** The match as it stood `delaySeconds` ago; `undefined` until its first snapshot comes. */
  getSnapshot(): ObservedSnapshot | undefined;
  onCombat(handler: (message: CombatMessage) => void): void;
  /**
   * The host's peer went (`reconnecting`) and came back (`online`), or is
   * gone, or said it left: there is nothing more to watch.
   */
  onConnectionChange(handler: (state: ConnectionState) => void): void;
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
  /** Each seat's cape as last sent (#3554), by id. */
  let capes = new Map<string, WireCape>();
  const worn = new Map<string, SeatWorn>();
  let lost = false;
  /** Set once `connectObserver` has resolved or rejected. */
  let settled = false;
  /**
   * The teams every team on the stream is one of (#2682), `observing`'s
   * map's. Before it only a host leaving counts, so the most are heard.
   */
  let teamCount: WireTeamCount = 3;
  /** Says the observe again until the host answers it (#1805). */
  let observeTimer: unknown;
  /** When the host's peer went (#4105), on the clock; `undefined` while it is here. */
  let droppedAt: number | undefined;
  let reconnectTimer: unknown;
  let onLostWhileJoining: () => void = () => undefined;
  const combatHandlers: ((message: CombatMessage) => void)[] = [];
  const stateHandlers: ((state: ConnectionState) => void)[] = [];

  const tell = (state: ConnectionState): void => {
    for (const handler of [...stateHandlers]) {
      handler(state);
    }
  };

  const fromHost = <T>(
    channel: Channel,
    parse: (value: unknown) => T | undefined,
    handle: (message: T) => void,
  ): void => {
    unsubscribe.push(onFromHost(transport, hostId, channel, parse, handle));
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
    clearInterval(observeTimer);
    tell(state);
  };

  /**
   * The host's peer went. Before `observing`, only noted, so its return
   * says the observe at once: the join's own timeout is its window (#4115).
   * Watching, wait the window out. It is measured on the clock, so a
   * hidden tab's late timer does not stretch it.
   */
  const dropHost = (): void => {
    if (lost || droppedAt !== undefined) {
      return;
    }
    droppedAt = Date.now();
    if (!settled) {
      return;
    }
    reconnectTimer = setTimeout(loseHost, RECONNECT_WINDOW_SECONDS * 1000);
    tell("reconnecting");
  };

  // A tick's snapshot comes in parts (#662); what follows sees it whole.
  const assemble = snapshotAssembler();
  // Nothing of the stream counts before `observing`: what comes earlier is
  // a match this peer watched before, its host still draining it (#480).
  fromHost(
    "snapshot",
    (value) => parseWireSnapshotPart(value, teamCount),
    (part) => {
      if (!settled) {
        return;
      }
      const snapshot = assemble(part);
      // Only ever forward: one late or replayed is dropped.
      if (snapshot === undefined || (latest !== undefined && snapshot.tick <= latest.wire.tick)) {
        return;
      }
      // One naming a status this build has no index for is malformed (#632).
      const players = playerSnapshots(snapshot, capes, worn);
      if (players !== undefined) {
        latest = { wire: snapshot, players };
      }
    },
  );
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
  fromHost(
    "ended",
    (value) => parseWireEnded(value, teamCount),
    (message) => {
      if (message.endReason === "host-left") {
        loseHost("host-left");
      } else if (settled) {
        ended = message;
      }
    },
  );
  const observe: PeerObserve = { protocolVersion: PROTOCOL_VERSION, matchId };
  /** Says the observe, and again until the host answers it (#1805). */
  const sayObserve = (): void => {
    transport.send("observe", observe, hostId);
    observeTimer = setInterval(() => {
      transport.send("observe", observe, hostId);
    }, HELLO_RESEND_MS);
  };
  unsubscribe.push(
    transport.onPeerLeave((peerId) => {
      if (peerId === hostId) {
        dropHost();
      }
    }),
    transport.onPeerJoin((peerId) => {
      if (peerId !== hostId || droppedAt === undefined) {
        return;
      }
      if (settled && Date.now() - droppedAt >= RECONNECT_WINDOW_SECONDS * 1000) {
        loseHost();
        return;
      }
      // One observe said at a time, however often the host flaps.
      clearInterval(observeTimer);
      sayObserve();
    }),
  );

  const stop = (): void => {
    clearInterval(observeTimer);
    clearTimeout(reconnectTimer);
    for (const off of unsubscribe.splice(0)) {
      off();
    }
    combatHandlers.length = 0;
    stateHandlers.length = 0;
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
          // A watcher is sent no charts (#3564).
          chart: undefined,
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
      onConnectionChange(handler) {
        stateHandlers.push(handler);
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
        // The answer to the observe said again after a drop (#4105).
        if (droppedAt !== undefined && !lost) {
          clearTimeout(reconnectTimer);
          clearInterval(observeTimer);
          droppedAt = undefined;
          tell("online");
        }
        return;
      }
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        fail(new MatchRefusedError({ reason: "protocol-mismatch" }));
        return;
      }
      teamCount = message.map.teamCount;
      settled = true;
      droppedAt = undefined;
      clearTimeout(timer);
      clearInterval(observeTimer);
      resolve(connection(message));
    });
    fromHost("refuse", parsePeerRefuse, (refusal) => {
      // Back after a drop to a match that is over (#4105): nothing to watch.
      if (settled && droppedAt !== undefined) {
        loseHost();
        return;
      }
      fail(new MatchRefusedError(refusal));
    });

    sayObserve();
  });
}
