import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  ZONE_TELEGRAPH_SECONDS,
  vec2,
  type MatchZone,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { DODGE_REACH, createDodgeCounter } from "./dodge-count.js";
import { canyonWorld } from "./canyon-world.js";
import { SELF_ID, TUTOR_ID, PLAYER_PROFESSION, houseBuild } from "./tutorial-world.js";

const TICK = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
const LAYER = 1;
/** A square rockfall 200 across round (1000, 1000), striking 1 s of every 6. */
const ZONE: MatchZone = {
  id: "rocks",
  kind: "rockfall",
  layer: LAYER,
  polygon: [vec2(900, 900), vec2(1100, 900), vec2(1100, 1100), vec2(900, 1100)],
  schedule: { periodSeconds: 6, activeSeconds: 1, offsetSeconds: 0 },
};
/** One period: idle, its telegraph, the strike and after, at every tick. */
const PERIOD = Array.from({ length: Math.round(6 / TICK) }, (_, at) => at * TICK + 6);

describe("createDodgeCounter (#3247)", () => {
  it("counts a strike missed within DODGE_REACH", () => {
    const counter = createDodgeCounter([ZONE]);
    const near = vec2(1000 + 200, 1000);
    counter.observe(5, near, LAYER);
    const tallies = PERIOD.map((seconds) => counter.observe(seconds, near, LAYER));
    expect(tallies.at(-1)).toEqual({ dodges: 1, hit: false });
    expect(tallies.some(({ hit }) => hit)).toBe(false);
  });

  it("does not count one missed from further off, or on another layer", () => {
    const counter = createDodgeCounter([ZONE]);
    counter.observe(5, vec2(1000 + 400, 1000), LAYER);
    for (const seconds of PERIOD) {
      counter.observe(seconds, vec2(1000 + 400, 1000), LAYER);
    }
    for (const seconds of PERIOD) {
      counter.observe(seconds + 6, vec2(1000 + 200, 1000), LAYER + 1);
    }
    expect(counter.observe(18, vec2(1000 + DODGE_REACH + 1, 1000), LAYER).dodges).toBe(0);
  });

  it("does not count a strike that hits, and says so once, the tick it lands", () => {
    const counter = createDodgeCounter([ZONE]);
    const inside = vec2(1000, 1000);
    counter.observe(5, inside, LAYER);
    const tallies = PERIOD.map((seconds) => counter.observe(seconds, inside, LAYER));
    expect(tallies.filter(({ hit }) => hit)).toHaveLength(1);
    const landed = tallies.findIndex(({ hit }) => hit);
    expect(PERIOD[landed]).toBeCloseTo(6 + ZONE_TELEGRAPH_SECONDS);
    expect(tallies.at(-1)?.dodges).toBe(0);
  });

  it("does not count a strike already falling at the first look", () => {
    const counter = createDodgeCounter([ZONE]);
    const near = vec2(1000 + 200, 1000);
    counter.observe(6 + ZONE_TELEGRAPH_SECONDS + 0.5, near, LAYER);
    expect(counter.observe(6 + 3, near, LAYER).dodges).toBe(0);
  });

  it("judges a hit as the canyon's simulation strikes: in a ring hurts, beside it does not", () => {
    const build = houseBuild(PLAYER_PROFESSION);
    const world = canyonWorld("dodge-test", build, build);
    const { simulation } = world;
    const counter = createDodgeCounter(world.zones);
    const first = world.zones.find((zone) => zone.id === "boulder-run-1");
    if (first === undefined) {
      throw new Error("no boulder-run-1");
    }
    const xs = first.polygon.map(({ x }) => x);
    const ys = first.polygon.map(({ y }) => y);
    const centre = vec2(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
    );
    const run = (seconds: number): { dodges: number; hits: number; hurt: boolean } => {
      let hits = 0;
      let dodges = 0;
      let hurt = false;
      for (let elapsed = 0; elapsed < seconds; elapsed += TICK) {
        const before = simulation.get(SELF_ID)?.combatant.health ?? 0;
        simulation.step(TICK);
        const self = simulation.get(SELF_ID);
        if (self === undefined) {
          throw new Error("no player");
        }
        hurt ||= self.combatant.health < before;
        const tally = counter.observe(simulation.elapsedSeconds, self.position, self.layer);
        hits += tally.hit ? 1 : 0;
        dodges = tally.dodges;
      }
      return { dodges, hits, hurt };
    };
    // Beside the first landing, 200 south of its middle: every strike is a dodge.
    simulation.walkTo(SELF_ID, vec2(centre.x, centre.y + 200), world.ground);
    simulation.walkTo(TUTOR_ID, vec2(centre.x - 400, centre.y + 200), world.ground);
    const beside = run(30);
    expect(beside.hurt).toBe(false);
    expect(beside.hits).toBe(0);
    expect(beside.dodges).toBeGreaterThanOrEqual(3);
    // In the middle of it: struck, and the counter saw it.
    simulation.walkTo(SELF_ID, centre, world.ground);
    const inside = run(12);
    expect(inside.hurt).toBe(true);
    expect(inside.hits).toBeGreaterThanOrEqual(1);
    expect(inside.dodges).toBe(beside.dodges);
  });
});
