import { DEFAULT_MATCH_RULES, createRng, seedFromString } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { connectMatch, type PeerMatchConnection } from "./match-client.js";
import { ARENA, TICK_SECONDS, hello, settle } from "./match-harness.test-support.js";
import { createMatchHost, type MatchHost, type PlannedSeats } from "./match-host.js";
import { createMemoryNetwork } from "./memory-transport.js";
import { messageBytes, type Transport } from "./transport.js";

/**
 * The load benchmark (brief §26), run as a test so it cannot rot: a change
 * that doubles a host's tick cost fails CI the day it lands, with the
 * numbers printed. Moved here from the old server (#404), where it timed
 * a Colyseus room; now the host is a page, so it times `MatchHost`.
 *
 * What is timed is `advance` for one tick: the simulation, building each
 * peer's snapshot, and handing every message to the transport, which
 * here encodes it as JSON as Trystero would. Clients decoding what they
 * get is outside it: that is each joiner's own page.
 *
 * Half the players move in a new direction 10 times a second and try a
 * random skill; the other half stop and auto-attack the foe beside them,
 * so they walk the path finder every tick (#267). As on the server, but
 * 16v16 is gone: a lobby seats at most 16 (`MAX_LOBBY_PLAYERS`).
 */

interface Scenario {
  readonly label: string;
  readonly perTeam: number;
  readonly seconds: number;
}

const SCENARIOS: readonly Scenario[] = [
  { label: "1v1", perTeam: 1, seconds: 6 },
  { label: "4v4", perTeam: 4, seconds: 6 },
  { label: "8v8", perTeam: 8, seconds: 6 },
];

/** What a tick may take: all of its interval, at the ruleset's rate. */
const BUDGET_MS = TICK_SECONDS * 1000;

interface Result {
  readonly label: string;
  readonly players: number;
  readonly samples: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  /** JSON bytes the host sent each peer, per second of match time. */
  readonly bytesPerPeerPerSecond: number;
}

// Real time, which no test here fakes, and the console the numbers go
// to: globals.d.ts declares only `console.error` for the package.
declare const performance: { now(): number };
declare const console: { info(...data: unknown[]): void };

/** `transport`, counting the JSON bytes it sends to each receiver. */
function metered(transport: Transport, peers: () => number): Transport & { bytes: number } {
  const wrapped = {
    ...transport,
    selfId: transport.selfId,
    bytes: 0,
    send(...args: Parameters<Transport["send"]>) {
      const [, data, to] = args;
      wrapped.bytes += messageBytes(data) * (to === undefined ? peers() : 1);
      transport.send(...args);
    },
  };
  return wrapped;
}

function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

async function runScenario(scenario: Scenario): Promise<Result> {
  const players = scenario.perTeam * 2;
  const network = createMemoryNetwork();
  const transport = metered(network.join("host"), () => players);
  // A match this size comes from a lobby, so its seats are planned.
  const seats: PlannedSeats = new Map(
    Array.from({ length: players }, (_, i) => [
      `bench-${String(i)}`,
      { team: i % 2 === 0 ? 0 : 1, name: `bench-${String(i)}` } as const,
    ]),
  );
  const hostRng = createRng(seedFromString(`bench-${scenario.label}`));
  const host: MatchHost = createMatchHost({
    transport,
    map: ARENA,
    seed: `bench-${scenario.label}`,
    matchRules: DEFAULT_MATCH_RULES,
    random: () => hostRng.nextFloat(),
    maxPlayers: players,
    seats,
  });
  const connections: PeerMatchConnection[] = [];
  for (const peerId of seats.keys()) {
    const peer = network.join(peerId);
    await settle();
    connections.push(
      await connectMatch({ transport: peer, hostId: "host", hello: hello(), timeoutMs: 1000 }),
    );
  }

  const rng = createRng(seedFromString(`bench-input-${scenario.label}`));
  const drive = (): void => {
    for (const [i, connection] of connections.entries()) {
      const foe = connections[i ^ 1];
      if (i % 4 < 2 && foe !== undefined) {
        connection.sendIntent({ kind: "stop" });
        connection.sendIntent({ kind: "attack", targetId: foe.selfSessionId });
        continue;
      }
      const angle = rng.nextFloat() * Math.PI * 2;
      connection.sendIntent({ kind: "move", dirX: Math.cos(angle), dirY: Math.sin(angle) });
      // Most casts are refused for range or recharge, which still runs
      // the whole activation gate, as a real match does.
      connection.sendIntent({ kind: "use-skill", slot: rng.nextInt(0, 8) });
    }
  };

  const ticks = Math.round(scenario.seconds / TICK_SECONDS);
  const inputEvery = Math.round(0.1 / TICK_SECONDS);
  const times: number[] = [];
  const bytesAtStart = transport.bytes;
  for (let tick = 0; tick < ticks; tick += 1) {
    if (tick % inputEvery === 0) {
      drive();
      await settle();
    }
    const startedAt = performance.now();
    host.advance(TICK_SECONDS);
    times.push(performance.now() - startedAt);
    // Every peer takes in its snapshot before the next tick, as it would
    // within a real tick's 50 ms.
    await settle();
  }
  await host.close("host-left");

  const sorted = [...times].sort((a, b) => a - b);
  return {
    label: scenario.label,
    players,
    samples: sorted.length,
    p50Ms: quantile(sorted, 0.5),
    p95Ms: quantile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1] ?? 0,
    bytesPerPeerPerSecond: (transport.bytes - bytesAtStart) / players / scenario.seconds,
  };
}

function format(results: readonly Result[]): string {
  return [
    `tick budget: ${BUDGET_MS.toFixed(1)}ms`,
    "",
    "scenario  players  tick p50   tick p95   tick max   net/peer",
    "-".repeat(62),
    ...results.map((r) =>
      [
        r.label.padEnd(10),
        String(r.players).padEnd(9),
        `${r.p50Ms.toFixed(2)}ms`.padEnd(11),
        `${r.p95Ms.toFixed(2)}ms`.padEnd(11),
        `${r.maxMs.toFixed(2)}ms`.padEnd(11),
        `${(r.bytesPerPeerPerSecond / 1024).toFixed(1)}KiB/s`,
      ].join(""),
    ),
  ].join("\n");
}

describe("load benchmark", () => {
  it("holds the tick budget at every scenario", { timeout: 120_000 }, async () => {
    const results: Result[] = [];
    for (const scenario of SCENARIOS) {
      results.push(await runScenario(scenario));
    }
    // Printed unconditionally: the point of a benchmark is the numbers.
    console.info(`\n${format(results)}\n`);

    for (const result of results) {
      // A tick must finish inside its own interval, or the host falls
      // behind the clock it promised its peers.
      expect(
        result.p95Ms,
        `${result.label} p95 tick time exceeded the ${String(BUDGET_MS)}ms budget`,
      ).toBeLessThan(BUDGET_MS);
      // Enough ticks ran for the percentile to mean something.
      expect(result.samples).toBeGreaterThan(20);
      // Every peer is being sent state: zero would mean the benchmark
      // timed a host talking to nobody.
      expect(result.bytesPerPeerPerSecond).toBeGreaterThan(0);
    }
  });
});
