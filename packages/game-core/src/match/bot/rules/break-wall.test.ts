import { describe, expect, it } from "vitest";

import type { Segment } from "../../../geometry.js";
import { vec2 } from "../../../vec2.js";
import { createCursor, decide, NO_OBJECTIVES, type BotBreakable } from "../../behaviour.js";
import { breakableTargetId, type BreakableField } from "../../breakables.js";
import { MatchSimulation, type ParticipantSpec } from "../../simulation.js";
import breakWall, { BREAK_WORTH_UNITS } from "./break-wall.js";
import {
  BOT,
  BOUNDS,
  contextFor,
  DT,
  fighter,
  match,
  RANGER,
  RULESET,
  ruleFor,
  WARRIOR,
} from "./test-support.js";

const WALL_ID = breakableTargetId("wall");

/** A wall from (`x`, `top`) down to (`x`, `bottom`), 8 thick. */
function wall(x: number, top: number, bottom: number): Segment[] {
  const corners = [vec2(x - 4, top), vec2(x + 4, top), vec2(x + 4, bottom), vec2(x - 4, bottom)];
  return corners.map((a, at) => ({ a, b: corners[(at + 1) % corners.length] ?? a }));
}

const FIELD: BreakableField = {
  id: "wall",
  segments: wall(800, 300, 500),
  layer: 0,
  maxHealth: 120,
};

/** The breakable wall down the middle, winning team 0 `gain`. */
function breakable(gain: number): BotBreakable {
  return { targetId: WALL_ID, field: FIELD, layer: 0, gain: [gain, 0] };
}

function think(sim: MatchSimulation, id: string, list: readonly BotBreakable[]) {
  return breakWall.decide(
    ruleFor(sim, id, {}, { objectives: { ...NO_OBJECTIVES, breakables: list }, now: 10 }),
  );
}

describe("break-wall (#3140)", () => {
  const sim = match([
    fighter("near", 0, WARRIOR, vec2(600, 400)),
    fighter("next", 0, RANGER, vec2(500, 300)),
    fighter("far", 0, WARRIOR, vec2(100, 400)),
    fighter("foe", 1, WARRIOR, vec2(1500, 400)),
  ]);

  it("sends the two idle bots nearest a wall worth breaking to strike it, not the third", () => {
    const list = [breakable(BREAK_WORTH_UNITS)];
    expect(think(sim, "near", list)).toMatchObject({ attackTargetId: WALL_ID, targetId: WALL_ID });
    expect(think(sim, "next", list)?.attackTargetId).toBe(WALL_ID);
    expect(think(sim, "far", list)).toBeUndefined();
  });

  it("leaves a wall alone that wins too little, or only the foes", () => {
    expect(think(sim, "near", [breakable(300)])).toBeUndefined();
    expect(think(sim, "near", [breakable(BREAK_WORTH_UNITS - 1)])).toBeUndefined();
    expect(think(sim, "near", [{ ...breakable(0), gain: [0, 1000] }])).toBeUndefined();
  });

  it("drops the wall for a foe within spell range of either striker", () => {
    const close = match([
      fighter("near", 0, WARRIOR, vec2(600, 400)),
      fighter("next", 0, RANGER, vec2(500, 300)),
      fighter("foe", 1, WARRIOR, vec2(500, 100)),
    ]);
    // The foe is near "next" only; "near" drops the wall too.
    expect(think(close, "near", [breakable(1000)])).toBeUndefined();
    const objectives = { ...NO_OBJECTIVES, breakables: [breakable(1000)] };
    const intent = decide(BOT, createCursor(), contextFor(close, "near", { objectives, now: 10 }));
    expect(intent.attackTargetId).not.toBe(WALL_ID);
  });

  it("strikes with its weapon, never a skill", () => {
    const objectives = { ...NO_OBJECTIVES, breakables: [breakable(1000)] };
    for (const id of ["near", "next"]) {
      const intent = decide(BOT, createCursor(), contextFor(sim, id, { objectives, now: 10 }));
      expect(intent.attackTargetId).toBe(WALL_ID);
      expect(intent.useSkillId).toBeUndefined();
    }
  });

  it("is idle on a map without a standing wall", () => {
    expect(think(sim, "near", [])).toBeUndefined();
  });
});

/** The breakable wall the only way between the two sides, unless `around` leaves a way over the top. */
function walled(participants: readonly ParticipantSpec[], around = false): MatchSimulation {
  return new MatchSimulation({
    seed: "break-wall",
    ruleset: RULESET,
    bounds: BOUNDS,
    participants,
    walls: [...wall(800, around ? 60 : -10, 300), ...wall(800, 500, 810)],
    breakables: [FIELD],
  });
}

function run(sim: MatchSimulation, seconds: number, until: () => boolean = () => false): void {
  for (let t = 0; t < seconds && !until(); t += DT) {
    sim.step(DT);
  }
}

describe("a wall's gain (#3140)", () => {
  const teams = [
    fighter("a", 0, WARRIOR, vec2(200, 400)),
    fighter("b", 1, WARRIOR, vec2(1400, 400)),
  ];

  it("is everything when it is the only way, for both teams", () => {
    const sim = walled(teams);
    sim.step(DT);
    expect(sim.botBreakables).toHaveLength(1);
    expect(sim.botBreakables[0]?.gain).toEqual([
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ]);
  });

  it("is what the way round is longer by, when there is one", () => {
    // Low down, by the gap the wall fills: the way over the top is long.
    const sim = walled(
      [fighter("a", 0, WARRIOR, vec2(600, 650)), fighter("b", 1, WARRIOR, vec2(1000, 650))],
      true,
    );
    sim.step(DT);
    const gain = sim.botBreakables[0]?.gain[0] ?? 0;
    expect(gain).toBeGreaterThan(BREAK_WORTH_UNITS);
    expect(gain).toBeLessThan(Number.POSITIVE_INFINITY);
  });

  it("is gone once the wall has crumbled", () => {
    const sim = walled(teams);
    sim.requestAttack("a", WALL_ID);
    run(sim, 30, () => sim.breakables[0]?.health === 0);
    expect(sim.breakables[0]?.health).toBe(0);
    sim.step(DT);
    expect(sim.botBreakables).toEqual([]);
    expect(think(sim, "a", sim.botBreakables)).toBeUndefined();
  });
});

describe("bots and a breakable wall (#3140)", () => {
  it("keep striking it with a foe just behind it, within spell range", () => {
    const sim = walled([
      fighter("a", 0, WARRIOR, vec2(700, 400)),
      fighter("a2", 0, RANGER, vec2(650, 350)),
      fighter("b", 1, WARRIOR, vec2(900, 400)),
    ]);
    sim.step(DT);
    const objectives = { ...NO_OBJECTIVES, breakables: sim.botBreakables };
    // The wall hides the foe from both strikers.
    const view = { objectives, now: 10, seesBetween: () => false };
    const intent = decide(BOT, createCursor(), contextFor(sim, "a", view));
    expect(intent.attackTargetId).toBe(WALL_ID);
    run(sim, 30, () => sim.breakables[0]?.health === 0);
    expect(sim.breakables[0]?.health).toBe(0);
  });

  it("break it when it is the only way to the foes, and meet them", () => {
    const sim = walled([
      fighter("a", 0, WARRIOR, vec2(200, 400)),
      fighter("a2", 0, RANGER, vec2(150, 300)),
      fighter("b", 1, WARRIOR, vec2(1400, 400)),
      fighter("b2", 1, RANGER, vec2(1450, 300)),
    ]);
    run(sim, 30, () => sim.breakables[0]?.health === 0);
    expect(sim.breakables[0]?.health).toBe(0);
    run(
      sim,
      20,
      () => (sim.get("a")?.position.x ?? 0) > 800 || (sim.get("b")?.position.x ?? 1600) < 800,
    );
    const crossed =
      (sim.get("a")?.position.x ?? 0) > 800 || (sim.get("b")?.position.x ?? 1600) < 800;
    expect(crossed).toBe(true);
  });
});
