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

const WALL_ID = breakableTargetId("crack");

/** A wall from (`x`, `top`) down to (`x`, `bottom`), 8 thick. */
function wall(x: number, top: number, bottom: number): Segment[] {
  const corners = [vec2(x - 4, top), vec2(x + 4, top), vec2(x + 4, bottom), vec2(x - 4, bottom)];
  return corners.map((a, at) => ({ a, b: corners[(at + 1) % corners.length] ?? a }));
}

const CRACK: BreakableField = {
  id: "crack",
  segments: wall(800, 300, 500),
  layer: 0,
  maxHealth: 300,
};

/** The crack, winning team 0 `gain`. */
function crack(gain: number): BotBreakable {
  return { targetId: WALL_ID, field: CRACK, layer: 0, gain: [gain, 0] };
}

/** What `id` does in `sim`, reading `list` as the map's standing breakable walls. */
function think(sim: MatchSimulation, id: string, list: readonly BotBreakable[]) {
  return breakWall.decide(
    ruleFor(sim, id, {}, { objectives: { ...NO_OBJECTIVES, breakables: list }, now: 10 }),
  );
}

describe("break-wall (#3140)", () => {
  const sim = match([
    fighter("near", 0, WARRIOR, vec2(700, 400)),
    fighter("next", 0, RANGER, vec2(600, 400)),
    fighter("far", 0, WARRIOR, vec2(100, 400)),
    fighter("foe", 1, WARRIOR, vec2(1500, 400)),
  ]);

  it("sends the two idle bots nearest a wall worth felling to strike it, and not the third", () => {
    expect(think(sim, "near", [crack(BREAK_WORTH_UNITS)])?.attackTargetId).toBe(WALL_ID);
    expect(think(sim, "next", [crack(BREAK_WORTH_UNITS)])?.attackTargetId).toBe(WALL_ID);
    expect(think(sim, "far", [crack(BREAK_WORTH_UNITS)])).toBeUndefined();
  });

  it("leaves a wall alone that wins too little, or only the foes", () => {
    expect(think(sim, "near", [crack(300)])).toBeUndefined();
    expect(think(sim, "near", [crack(BREAK_WORTH_UNITS - 1)])).toBeUndefined();
    expect(think(sim, "near", [{ ...crack(0), gain: [0, 1000] }])).toBeUndefined();
  });

  it("strikes with blows only, never a skill", () => {
    const intent = think(sim, "near", [crack(1000)]);
    expect(intent?.useSkillId).toBeUndefined();
    expect(intent?.targetId).toBeUndefined();
  });

  it("is idle once the wall has crumbled", () => {
    expect(think(sim, "near", [])).toBeUndefined();
  });

  it("fights a foe in reach of either striker first", () => {
    const close = match([
      fighter("near", 0, WARRIOR, vec2(700, 400)),
      fighter("next", 0, RANGER, vec2(600, 400)),
      fighter("foe", 1, WARRIOR, vec2(500, 400)),
    ]);
    // The foe is in reach of `next`, and `near` drops the wall with it.
    expect(think(close, "near", [crack(1000)])).toBeUndefined();
    expect(think(close, "next", [crack(1000)])).toBeUndefined();
    const objectives = { ...NO_OBJECTIVES, breakables: [crack(1000)] };
    const intent = decide(BOT, createCursor(), contextFor(close, "next", { objectives, now: 10 }));
    expect(intent.attackTargetId).not.toBe(WALL_ID);
  });

  it("keeps striking with a foe in reach behind the wall, out of sight", () => {
    const across = match([
      fighter("near", 0, WARRIOR, vec2(780, 400)),
      fighter("next", 0, RANGER, vec2(760, 400)),
      fighter("foe", 1, WARRIOR, vec2(820, 400)),
    ]);
    const objectives = { ...NO_OBJECTIVES, breakables: [crack(1000)] };
    const unseen = ruleFor(across, "near", {}, { objectives, now: 10, seesBetween: () => false });
    expect(breakWall.decide(unseen)?.attackTargetId).toBe(WALL_ID);
    const intent = decide(
      BOT,
      createCursor(),
      contextFor(across, "near", { objectives, now: 10, seesBetween: () => false }),
    );
    expect(intent.attackTargetId).toBe(WALL_ID);
  });
});

/** The crack down the middle, in a wall with a way round over the top unless `sealed`. */
function cracked(participants: readonly ParticipantSpec[], sealed = false): MatchSimulation {
  return new MatchSimulation({
    seed: "break-wall",
    ruleset: RULESET,
    bounds: BOUNDS,
    participants,
    walls: [...wall(800, sealed ? -10 : 60, 300), ...wall(800, 500, 810)],
    breakables: [CRACK],
  });
}

function run(sim: MatchSimulation, seconds: number, until: () => boolean = () => false): void {
  for (let t = 0; t < seconds && !until(); t += DT) {
    sim.step(DT);
  }
}

describe("a breakable wall's gain (#3140)", () => {
  it("is what its fall shortens each team's way by", () => {
    const sim = cracked([
      fighter("a", 0, WARRIOR, vec2(200, 780)),
      fighter("b", 1, WARRIOR, vec2(1400, 780)),
    ]);
    sim.step(DT);
    const [read] = sim.botBreakables;
    expect(read).toMatchObject({ targetId: WALL_ID, layer: 0 });
    expect(read?.gain[0]).toBeGreaterThan(0);
    expect(read?.gain[0]).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(read?.gain[1]).toBeCloseTo(read?.gain[0] ?? 0);
  });

  it("is everything when it is the only way, and it is gone once it crumbles", () => {
    const sim = cracked(
      [fighter("a", 0, WARRIOR, vec2(200, 400)), fighter("b", 1, WARRIOR, vec2(1400, 400))],
      true,
    );
    sim.step(DT);
    expect(sim.botBreakables[0]?.gain).toEqual([
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ]);
  });
});

describe("bots and a breakable wall (#3140)", () => {
  it("strike it down with blows when it is the only way to the foes, and cross", () => {
    const sim = cracked(
      [
        fighter("a", 0, WARRIOR, vec2(200, 400)),
        fighter("a2", 0, RANGER, vec2(150, 350)),
        fighter("b", 1, WARRIOR, vec2(1400, 400)),
        fighter("b2", 1, RANGER, vec2(1450, 350)),
      ],
      true,
    );
    const skillsAtWall: string[] = [];
    const standing = (): boolean => (sim.breakables[0]?.health ?? 0) > 0;
    for (let t = 0; t < 40 && standing(); t += DT) {
      for (const entry of sim.step(DT).log) {
        if (
          entry.skillId !== undefined &&
          entry.events.some((event) => "targetId" in event && event.targetId === WALL_ID)
        ) {
          skillsAtWall.push(entry.skillId);
        }
      }
    }
    expect(standing()).toBe(false);
    expect(skillsAtWall).toEqual([]);
    sim.step(DT);
    expect(sim.botBreakables).toEqual([]);
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

describe("break-wall, shot at from afar (#3150)", () => {
  it("drops the wall for a foe shooting at either striker from beyond 420", () => {
    const sim = match([
      fighter("near", 0, WARRIOR, vec2(700, 400)),
      fighter("next", 0, RANGER, vec2(600, 400)),
      fighter("foe", 1, RANGER, vec2(100, 400)),
    ]);
    const objectives = { ...NO_OBJECTIVES, breakables: [crack(1000)] };
    const shot = () => ruleFor(sim, "near", { foeReach: () => 600 }, { objectives, now: 10 });
    expect(breakWall.decide(shot())?.attackTargetId).toBe(WALL_ID);
    const foe = sim.get("foe");
    if (foe === undefined) throw new Error("no foe");
    foe.targetId = "next";
    expect(breakWall.decide(shot())).toBeUndefined();
  });
});
