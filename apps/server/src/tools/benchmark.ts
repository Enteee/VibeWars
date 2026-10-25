import type { Client, Room } from "@colyseus/sdk";
import { matchMaker } from "@colyseus/core";
import { createRng, seedFromString } from "@vibewars/game-core";

import {
  DEFAULT_MAP_ID,
  MatchRoom,
  openLobbyMatch,
  type TickMetrics,
} from "../rooms/match-room.js";
import { createGameServer, type GameServer } from "../server.js";
import { findFreePort, waitFor } from "../testing/harness.js";

/**
 * Load benchmarks at realistic team sizes (brief §26).
 *
 * Deliberately measured against a *real* server over *real* WebSockets
 * with *real* schema decoding on each client, rather than by calling
 * `tick()` in a loop. The question this answers is "does a 16v16 LAN match
 * hold 20 Hz", and most of the cost in that question is state encoding and
 * per-client delta emission — precisely what a direct tick loop skips.
 *
 * The brief says not to optimise prematurely and to use profiling data.
 * So this reports numbers; it does not tune anything.
 */

/** What a single scenario measured. */
export interface BenchmarkResult {
  readonly label: string;
  readonly players: number;
  /** Server tick time against its 50 ms budget. */
  readonly tick: TickMetrics;
  /** Heap used by the server process at the end of the run, in MiB. */
  readonly heapUsedMb: number;
  /** Bytes pushed to each client per second, averaged over the run. */
  readonly bytesPerClientPerSecond: number;
  /** Intent-sent to state-visible round trip, in milliseconds. */
  readonly syncLatencyMs: LatencyStats;
}

export interface LatencyStats {
  readonly samples: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

export interface Scenario {
  readonly label: string;
  readonly perTeam: number;
  readonly seconds: number;
}

export const DEFAULT_SCENARIOS: readonly Scenario[] = [
  { label: "1v1", perTeam: 1, seconds: 6 },
  { label: "4v4", perTeam: 4, seconds: 6 },
  { label: "8v8", perTeam: 8, seconds: 6 },
  { label: "16v16", perTeam: 16, seconds: 6 },
];

/**
 * Count bytes arriving on every client socket in this process.
 *
 * Wrapping the global `WebSocket` is intrusive, but the alternative —
 * asking the server how much it *intended* to send — measures the wrong
 * thing. What matters for a LAN is what actually crosses the wire, after
 * Colyseus has decided which deltas each client needs.
 */
interface ByteMeter {
  received: number;
  restore: () => void;
}

function meterWebSocketBytes(): ByteMeter {
  const original = globalThis.WebSocket;
  const meter: ByteMeter = {
    received: 0,
    restore: () => {
      globalThis.WebSocket = original;
    },
  };

  class CountingWebSocket extends original {
    // Arguments are forwarded verbatim rather than re-specified: the SDK
    // first tries a Node-style `new WebSocket(url, {headers, protocols})`
    // and *relies on it throwing* in a browser-shaped environment to fall
    // back. Narrowing the signature here would change which call throws.
    public constructor(...args: ConstructorParameters<typeof original>) {
      super(...args);
      this.addEventListener("message", (event: Event) => {
        const { data } = event as { data?: unknown };
        if (data instanceof ArrayBuffer) {
          meter.received += data.byteLength;
        } else if (ArrayBuffer.isView(data)) {
          meter.received += data.byteLength;
        } else if (typeof data === "string") {
          meter.received += data.length;
        }
      });
    }
  }

  globalThis.WebSocket = CountingWebSocket;
  return meter;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[index] ?? 0;
}

function summarise(values: readonly number[]): LatencyStats {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    max: sorted.length === 0 ? 0 : (sorted[sorted.length - 1] ?? 0),
  };
}

interface Participant {
  readonly room: Room;
  readonly sessionId: string;
}

/**
 * Measure how long it takes for an intent to become visible state.
 *
 * Uses `target`, not `move`: a target change is a discrete value the
 * client can match exactly against what it sent, so a sample is
 * unambiguously attributable to one intent. Position would require
 * guessing which tick a continuous value came from.
 */
async function measureSyncLatency(
  participant: Participant,
  partnerSessionId: string,
  samples: number,
): Promise<number[]> {
  const latencies: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const wanted = i % 2 === 0 ? partnerSessionId : null;
    const expected = wanted ?? "";
    const sentAt = performance.now();
    participant.room.send("intent", { kind: "target", targetSessionId: wanted });
    try {
      await waitFor(
        () => {
          const state = participant.room.state as {
            players: { get: (id: string) => { targetSessionId: string } | undefined };
          };
          return state.players.get(participant.sessionId)?.targetSessionId === expected;
        },
        { timeoutMs: 2000, intervalMs: 1, label: "target to appear in state" },
      );
      latencies.push(performance.now() - sentAt);
    } catch {
      // A dropped sample is better than a fabricated one; the sample
      // count in the report shows if this happened often.
    }
  }
  return latencies;
}

/** Drive continuous movement and skill use, the way a real match looks. */
function driveInputs(participants: readonly Participant[], seed: string): () => void {
  const rng = createRng(seedFromString(seed));
  const timer = setInterval(() => {
    for (const participant of participants) {
      const angle = rng.nextFloat() * Math.PI * 2;
      participant.room.send("intent", {
        kind: "move",
        dirX: Math.cos(angle),
        dirY: Math.sin(angle),
      });
      // Every client constantly tries to cast. Most attempts are rejected
      // for range or recharge, which is realistic and still exercises the
      // full activation gate each time.
      participant.room.send("intent", { kind: "use-skill", slot: rng.nextInt(0, 8) });
    }
  }, 100);
  return () => {
    clearInterval(timer);
  };
}

type ClientCtor = typeof Client;

async function runScenario(
  scenario: Scenario,
  endpoint: string,
  meter: ByteMeter,
  Client: ClientCtor,
): Promise<BenchmarkResult> {
  const playerCount = scenario.perTeam * 2;
  const participants: Participant[] = [];

  // A match this size comes from a lobby, so it is opened like one: a
  // private room with a seat reserved for each player (#41).
  const reservations = await openLobbyMatch(
    DEFAULT_MAP_ID,
    Array.from({ length: playerCount }, (_, i) => ({
      team: i % 2 === 0 ? 0 : 1,
      name: `bench-${String(i)}`,
      build: undefined,
    })),
  );
  for (const reservation of reservations) {
    const room = await new Client(endpoint).consumeSeatReservation(reservation);
    participants.push({ room, sessionId: room.sessionId });
  }
  const first = participants[0]?.room;
  if (first === undefined) {
    throw new Error("A scenario needs at least one participant");
  }

  await waitFor(
    () => {
      const state = first.state as { players: { size: number } };
      return state.players.size === playerCount;
    },
    { timeoutMs: 20_000, label: `${String(playerCount)} players to join` },
  );

  const room = matchMaker.getLocalRoomById(first.roomId);
  if (!(room instanceof MatchRoom)) {
    throw new Error(`Expected a MatchRoom for ${first.roomId}`);
  }

  const bytesAtStart = meter.received;
  const startedAt = performance.now();
  const stopDriving = driveInputs(participants, `bench-${scenario.label}`);

  // Latency is sampled from one participant while every other client is
  // still generating load, so it reflects a loaded server rather than an
  // idle one.
  const observer = participants[0];
  const partner = participants[1] ?? participants[0];
  if (observer === undefined || partner === undefined) {
    throw new Error("A scenario needs at least one participant");
  }

  const latencyPromise = measureSyncLatency(observer, partner.sessionId, 30);
  await new Promise((resolve) => setTimeout(resolve, scenario.seconds * 1000));
  const latencies = await latencyPromise;

  stopDriving();
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const bytes = meter.received - bytesAtStart;
  const tick = room.tickMetrics();

  // A gc before sampling, when the runner was started with --expose-gc:
  // without it the number is dominated by uncollected garbage and says
  // more about allocation rate than about retained memory.
  const maybeGc = (globalThis as { gc?: () => void }).gc;
  maybeGc?.();
  const heapUsedMb = process.memoryUsage().heapUsed / 1024 / 1024;

  await Promise.all(participants.map((p) => p.room.leave(true)));

  return {
    label: scenario.label,
    players: playerCount,
    tick,
    heapUsedMb,
    bytesPerClientPerSecond: bytes / playerCount / elapsedSeconds,
    syncLatencyMs: summarise(latencies),
  };
}

export async function runBenchmarks(
  scenarios: readonly Scenario[] = DEFAULT_SCENARIOS,
): Promise<readonly BenchmarkResult[]> {
  const meter = meterWebSocketBytes();
  const port = await findFreePort();
  const endpoint = `ws://127.0.0.1:${String(port)}`;
  let server: GameServer | undefined;

  try {
    // Imported only now, so the SDK module captures the metered
    // WebSocket: it resolves `globalThis.WebSocket` once at module scope,
    // which a static import would have done before the meter was installed.
    const { Client } = await import("@colyseus/sdk");

    server = createGameServer({
      port,
      host: "127.0.0.1",
      webRoot: undefined,
      devMode: false,
    });
    await server.listen(port);

    const results: BenchmarkResult[] = [];
    for (const scenario of scenarios) {
      results.push(await runScenario(scenario, endpoint, meter, Client));
    }
    return results;
  } finally {
    meter.restore();
    await server?.gracefullyShutdown(false);
  }
}

export function formatResults(results: readonly BenchmarkResult[]): string {
  const budget = results[0]?.tick.budgetMs ?? 0;
  const lines = [
    `tick budget: ${budget.toFixed(1)}ms`,
    "",
    "scenario  players  tick p50   tick p95   tick max   heap      net/client   sync p50   sync p95",
    "-".repeat(94),
  ];

  for (const r of results) {
    lines.push(
      [
        r.label.padEnd(9),
        String(r.players).padEnd(8),
        `${r.tick.p50Ms.toFixed(2)}ms`.padEnd(10),
        `${r.tick.p95Ms.toFixed(2)}ms`.padEnd(10),
        `${r.tick.maxMs.toFixed(2)}ms`.padEnd(10),
        `${r.heapUsedMb.toFixed(0)}MiB`.padEnd(9),
        `${(r.bytesPerClientPerSecond / 1024).toFixed(1)}KiB/s`.padEnd(12),
        `${r.syncLatencyMs.p50.toFixed(1)}ms`.padEnd(10),
        `${r.syncLatencyMs.p95.toFixed(1)}ms`,
      ].join(""),
    );
  }

  lines.push(
    "",
    "Client FPS is not measured here: it needs a real browser compositing real",
    "frames, which this headless harness has no way to observe. Reporting a",
    "number for it would be a guess (brief §45).",
  );
  return lines.join("\n");
}
