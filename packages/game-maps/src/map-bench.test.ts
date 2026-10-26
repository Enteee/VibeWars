import { runTickBench, tickStats, type BenchField, type Vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { allWallSegments } from "./geometry.js";
import { loadAllMaps, loadMap } from "./loader.js";
import type { MapData } from "./schema.js";

/**
 * The tick bench (#542) on an arena (#444): `BENCH_MAP=arena-long-hall
 * pnpm run bench:ticks`. Always a short smoke run on every arena; the
 * timed run only when asked for. No timing assertion: CI machines vary.
 */

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };
declare const performance: { now(): number };
declare const console: { log(message: string): void };

const now = (): number => performance.now();
const WARM_UP = 50;
const PER_TEAM = 8;
/** How far apart bodies stand when a spawn takes more than one. */
const STEP = 40;

/**
 * `map`'s field for an 8v8: each team's spawns taken in turn, a spawn's
 * second and later bodies stepped in toward the arena's middle. Even ids
 * are team 0, odd team 1, each across from its mirror.
 */
function mapBenchField(map: MapData): BenchField {
  const middle = { x: map.width / 2, y: map.height / 2 };
  const placed = (team: number, k: number): Vec2 => {
    const spawns = map.spawnPoints.filter((spawn) => spawn.team === team);
    const spawn = spawns[k % spawns.length]?.position ?? middle;
    const toward = { x: middle.x - spawn.x, y: middle.y - spawn.y };
    const length = Math.hypot(toward.x, toward.y) || 1;
    const out = Math.floor(k / spawns.length) * STEP;
    return { x: spawn.x + (toward.x / length) * out, y: spawn.y + (toward.y / length) * out };
  };
  return {
    bounds: { width: map.width, height: map.height },
    walls: allWallSegments(map.walls),
    spawns: Array.from({ length: 2 * PER_TEAM }, (_, i) => ({
      id: `p${String(i)}`,
      team: i % 2,
      at: placed(i % 2, Math.floor(i / 2)),
    })),
  };
}

describe("the tick bench on an arena (#444)", () => {
  it.each(loadAllMaps().map((map) => [map.id, map] as const))(
    "runs an 8v8 on %s, and every fighter moves",
    (_, map) => {
      const { moved } = runTickBench({ ticks: 40, seed: "bench", now, field: mapBenchField(map) });
      for (const [id, { from, to }] of moved) {
        expect(Math.hypot(to.x - from.x, to.y - from.y), id).toBeGreaterThan(0);
      }
    },
  );

  const ticks = Number(process.env.BENCH_TICKS ?? "0");
  const mapId = process.env.BENCH_MAP ?? "dense";
  it.runIf(ticks > WARM_UP && mapId !== "dense")(`times ${String(ticks)} ticks on ${mapId}`, () => {
    const { tickMs } = runTickBench({
      ticks,
      seed: "bench",
      now,
      field: mapBenchField(loadMap(mapId)),
    });
    const { p50, p95, max } = tickStats(tickMs.slice(WARM_UP));
    console.log(
      `${mapId}, ticks ${String(WARM_UP)}–${String(ticks)}: p50 ${p50.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms, max ${max.toFixed(3)} ms`,
    );
    expect(tickMs).toHaveLength(ticks);
  });
});
