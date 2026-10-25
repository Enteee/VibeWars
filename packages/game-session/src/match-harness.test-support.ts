/**
 * A P2P match in one process, for tests (#375): a host over the memory
 * transport, its own player through `createLocalPeer`, and as many remote
 * clients as a test joins. No timers: a test moves the match on with
 * `step`, and `settle` lets every message in flight land.
 *
 * Not a test file itself (vitest runs `*.test.ts` only), and left out of
 * the build.
 */
import { DEFAULT_MATCH_RULES, segment, type MatchRules } from "@vibewars/game-core";
import { PROTOCOL_VERSION, type JsonValue, type PeerHello } from "@vibewars/game-protocol";

import { createLocalPeer } from "./local-peer.js";
import { connectMatch, type PeerMatchConnection } from "./match-client.js";
import type { MatchSnapshot, PlayerSnapshot } from "./match-connection.js";
import { createMatchHost, RULESET, type HostMap, type MatchHost } from "./match-host.js";
import { createMemoryNetwork, type MemoryNetwork } from "./memory-transport.js";
import type { Transport } from "./transport.js";

export const TICK_SECONDS = 1 / RULESET.tickRateHz;

/**
 * A plain arena: 2000 by 1200, two spawns a side, one wall in the middle
 * well away from both, so a test can walk into it on purpose.
 */
export const ARENA: HostMap = {
  descriptor: {
    id: "test-arena",
    name: "Test Arena",
    width: 2000,
    height: 1200,
    walls: [{ kind: "rect", x: 990, y: 900, width: 20, height: 200 }],
  },
  walls: [
    segment({ x: 990, y: 900 }, { x: 1010, y: 900 }),
    segment({ x: 1010, y: 900 }, { x: 1010, y: 1100 }),
    segment({ x: 1010, y: 1100 }, { x: 990, y: 1100 }),
    segment({ x: 990, y: 1100 }, { x: 990, y: 900 }),
  ],
  bounds: { width: 2000, height: 1200 },
  spawns: [
    { team: 0, position: { x: 400, y: 500 } },
    { team: 1, position: { x: 700, y: 500 } },
    { team: 0, position: { x: 400, y: 600 } },
    { team: 1, position: { x: 700, y: 600 } },
  ],
};

/** Let every message in flight land, and every message those send in turn. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
  }
}

export function hello(
  overrides: Partial<{ name: string; build: JsonValue; rejoin: PeerHello["rejoin"] }> = {},
): PeerHello {
  return {
    protocolVersion: PROTOCOL_VERSION,
    name: overrides.name ?? "Tester",
    build: overrides.build ?? null,
    rejoin: overrides.rejoin ?? null,
  };
}

export interface TestMatch {
  readonly network: MemoryNetwork;
  readonly host: MatchHost;
  /** The host's transport, as remote peers see it. */
  readonly hostTransport: Transport;
  /** The host's own player's side of `createLocalPeer`. */
  readonly local: Transport;
  /** Run `seconds` of match time, a tick at a time, letting messages land between. */
  step(seconds: number): Promise<void>;
  /** A remote peer joining with `hello`; resolves once it is in. */
  join(peerHello?: PeerHello): Promise<{ connection: PeerMatchConnection; transport: Transport }>;
  /** The host's own player joining, through `createLocalPeer`. */
  joinLocal(peerHello?: PeerHello): Promise<PeerMatchConnection>;
}

export function startMatch(
  options: { matchRules?: MatchRules; maxPlayers?: number; random?: () => number } = {},
): TestMatch {
  const network = createMemoryNetwork();
  const remote = network.join("host");
  const { host: hostTransport, local } = createLocalPeer(remote);
  let draws = 0;
  const host = createMatchHost({
    transport: hostTransport,
    map: ARENA,
    seed: "test",
    matchRules: options.matchRules ?? DEFAULT_MATCH_RULES,
    // Reproducible, and different each draw.
    random: options.random ?? (() => ((draws += 1) * 0.6180339887) % 1),
    maxPlayers: options.maxPlayers ?? 8,
  });
  return {
    network,
    host,
    hostTransport,
    local,
    async step(seconds) {
      const ticks = Math.round(seconds / TICK_SECONDS);
      for (let i = 0; i < ticks; i += 1) {
        host.advance(TICK_SECONDS);
        await settle();
      }
    },
    async join(peerHello = hello()) {
      const transport = network.join();
      await settle();
      const connection = await connectMatch({
        transport,
        hostId: "host",
        hello: peerHello,
        timeoutMs: 1000,
      });
      return { connection, transport };
    },
    async joinLocal(peerHello = hello()) {
      await settle();
      return connectMatch({ transport: local, hostId: "host", hello: peerHello, timeoutMs: 1000 });
    },
  };
}

/** `connection`'s own player in its latest snapshot. */
export function self(connection: {
  getSnapshot(): MatchSnapshot;
  selfSessionId: string;
}): PlayerSnapshot | undefined {
  return playerIn(connection.getSnapshot(), connection.selfSessionId);
}

export function playerIn(snapshot: MatchSnapshot, id: string): PlayerSnapshot | undefined {
  return snapshot.players.find((player) => player.sessionId === id);
}
