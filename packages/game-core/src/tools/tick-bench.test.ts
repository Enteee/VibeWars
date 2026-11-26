import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import {
  DENSE_FIELD,
  casterSpawns,
  runTickBench,
  tickStats,
  type BenchCrowd,
} from "./tick-bench.js";

/**
 * The tick bench (#542). Always a 40-tick smoke run; with `BENCH_TICKS`
 * set (`pnpm run bench:ticks`), that many, and the numbers printed for
 * ticks after the first 50, which hold the JIT's warm-up; `BENCH_CROWD=followers`
 * times 32 minions walking back to their owners instead (#1157), and
 * `BENCH_CROWD=casters` 16 bodies using their bars (#1588), with
 * `BENCH_SKILLS=id,id,...` on every bar if set. No timing assertion: CI
 * machines vary, and a timing gate would flake.
 */

// game-core has no Node or DOM types (ADR-0001); the test runner has all three.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };
declare const performance: { now(): number };
declare const console: { log(message: string): void };

const now = (): number => performance.now();

const WARM_UP = 50;

describe("the tick bench (#542)", () => {
  it("runs the dense field: 252 wall segments, and every fighter moves", () => {
    expect(DENSE_FIELD.walls).toHaveLength(252);
    const { tickMs, moved } = runTickBench({
      ticks: 40,
      seed: "bench",
      now,
      field: DENSE_FIELD,
      crowd: "fighters",
    });
    expect(tickMs).toHaveLength(40);
    for (const [id, { from, to }] of moved) {
      expect(Math.hypot(to.x - from.x, to.y - from.y), id).toBeGreaterThan(0);
    }
  });

  it("runs 32 followers across the dense field, and every one walks back (#1157)", () => {
    const { moved } = runTickBench({
      ticks: 40,
      seed: "bench",
      now,
      field: DENSE_FIELD,
      crowd: "followers",
    });
    expect(moved.size).toBe(32);
    for (const [id, { from, to }] of moved) {
      expect(Math.hypot(to.x - from.x, to.y - from.y), id).toBeGreaterThan(0);
    }
  });

  it("stands the casters in the open, each within spell range of its mirror (#1588)", () => {
    const spawns = casterSpawns(DENSE_FIELD);
    expect(spawns).toHaveLength(16);
    // Each pillar's top-left corner is its first segment's start, 80 on a side.
    const pillars = DENSE_FIELD.walls.filter((_, i) => i % 4 === 0).map((wall) => wall.a);
    for (const { id, at } of spawns) {
      for (const corner of pillars) {
        const inside =
          at.x >= corner.x && at.x <= corner.x + 80 && at.y >= corner.y && at.y <= corner.y + 80;
        expect(inside, `${id} in the pillar at ${String(corner.x)},${String(corner.y)}`).toBe(
          false,
        );
      }
    }
    for (let i = 0; i < 16; i += 2) {
      const [left, right] = [spawns[i], spawns[i + 1]];
      expect(left?.team).toBe(0);
      expect(right?.team).toBe(1);
      expect(left && right ? Math.abs(right.at.x - left.at.x) : Infinity).toBeLessThan(RANGE_SPELL);
      expect(left?.at.y).toBe(right?.at.y);
    }
  });

  it("runs 16 casters on their starter bars, and every one uses a skill (#1588)", () => {
    const { tickMs, skillsUsed } = runTickBench({
      ticks: 40,
      seed: "bench",
      now,
      field: DENSE_FIELD,
      crowd: "casters",
    });
    expect(tickMs).toHaveLength(40);
    expect(skillsUsed).toBeGreaterThanOrEqual(16);
  });

  it("puts the skills given on every caster's bar, and refuses an unknown one (#1588)", () => {
    const { skillsUsed } = runTickBench({
      ticks: 40,
      seed: "bench",
      now,
      field: DENSE_FIELD,
      crowd: "casters",
      skills: ["elementalist.fireball", "monk.orison-of-healing"],
    });
    expect(skillsUsed).toBeGreaterThanOrEqual(16);
    expect(() =>
      runTickBench({
        ticks: 1,
        seed: "bench",
        now,
        field: DENSE_FIELD,
        crowd: "casters",
        skills: ["elementalist.fireball", "nobody.no-such-skill"],
      }),
    ).toThrow(/nobody\.no-such-skill/);
  });

  it("uses no skills in the other crowds", () => {
    const { skillsUsed } = runTickBench({
      ticks: 5,
      seed: "bench",
      now,
      field: DENSE_FIELD,
      crowd: "fighters",
    });
    expect(skillsUsed).toBe(0);
  });

  // An arena's own bench is game-maps' (`map-bench.test.ts`, #444): game-core has no maps.
  const ticks = Number(process.env.BENCH_TICKS ?? "0");
  const dense = (process.env.BENCH_MAP ?? "dense") === "dense";
  const crowd: BenchCrowd =
    process.env.BENCH_CROWD === "followers" || process.env.BENCH_CROWD === "casters"
      ? process.env.BENCH_CROWD
      : "fighters";
  const skills = process.env.BENCH_SKILLS?.split(",").filter((id) => id !== "");
  it.runIf(ticks > WARM_UP && dense)(
    `times ${String(ticks)} ticks of ${crowd}`,
    () => {
      const { tickMs, skillsUsed } = runTickBench({
        ticks,
        seed: "bench",
        now,
        field: DENSE_FIELD,
        crowd,
        ...(skills === undefined ? {} : { skills }),
      });
      const { p50, p95, max } = tickStats(tickMs.slice(WARM_UP));
      console.log(
        `ticks ${String(WARM_UP)}–${String(ticks)}: p50 ${p50.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms, max ${max.toFixed(3)} ms` +
          (crowd === "casters" ? `, ${String(skillsUsed)} skills used` : ""),
      );
      expect(tickMs).toHaveLength(ticks);
    },
    // Hundreds of ticks on a loaded machine outlast the default 5 s.
    60_000,
  );
});
