import { describe, expect, it } from "vitest";

import type { Segment } from "../geometry.js";
import { vec2 } from "../vec2.js";
import { body, BOUNDS, DT, fighter, RANGER, RULESET, WARRIOR } from "./bot/rules/test-support.js";
import {
  breakableIdOf,
  breakableTargetId,
  damageBreakable,
  initialBreakables,
  strikePointOf,
  type BreakableField,
} from "./breakables.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/** A wall right across the map, x = 396 to 404. */
const CORNERS = [vec2(396, -10), vec2(404, -10), vec2(404, 810), vec2(396, 810)];
const SEGMENTS: readonly Segment[] = CORNERS.map((a, at) => ({
  a,
  b: CORNERS[(at + 1) % CORNERS.length] ?? a,
}));
const WALL: BreakableField = { id: "wall", segments: SEGMENTS, layer: 0, maxHealth: 300 };
const TARGET = breakableTargetId("wall");

function arena(participants: readonly ParticipantSpec[], field = WALL): MatchSimulation {
  return new MatchSimulation({
    seed: "breakables",
    ruleset: RULESET,
    bounds: BOUNDS,
    participants,
    breakables: [field],
  });
}

function run(sim: MatchSimulation, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) {
    sim.step(DT);
  }
}

function health(sim: MatchSimulation): number | undefined {
  return sim.breakables[0]?.health;
}

/** A player, no bot, with `skill` in its first slot and the ranks and energy to cast it. */
function caster(id: string, skill: string, attribute: string): ParticipantSpec {
  return body(id, 0, vec2(300, 400), {
    skillBar: [skill],
    attributeRanks: new Map([[attribute, 12]]),
  });
}

const FOE = body("foe", 1, vec2(1500, 700));

describe("breakable walls (#3031)", () => {
  it("names its target id and back", () => {
    expect(breakableIdOf(TARGET)).toBe("wall");
    expect(breakableIdOf("switch-wall")).toBeUndefined();
  });

  it("takes damage down to 0, and never comes back from it", () => {
    const [wall] = initialBreakables([WALL]);
    if (wall === undefined) throw new Error("no wall");
    const hit = damageBreakable(wall, 120.4);
    expect(hit.health).toBe(180);
    const down = damageBreakable(hit, 1000);
    expect(down.health).toBe(0);
    expect(damageBreakable(down, 50)).toBe(down);
  });

  it("is struck `standoff` short of its nearest side", () => {
    expect(strikePointOf(WALL, vec2(300, 400), 20)).toEqual(vec2(376, 400));
    expect(strikePointOf(WALL, vec2(500, 400), 20)).toEqual(vec2(424, 400));
    expect(strikePointOf(WALL, vec2(390, 400), 20)).toEqual(vec2(390, 400));
  });

  it("is worn down by a warrior's blows, crumbles at 0 and stays down", () => {
    const sim = arena([
      fighter("warrior", 0, WARRIOR, vec2(300, 400), { behaviour: undefined }),
      FOE,
    ]);
    expect(sim.setTarget("warrior", TARGET)).toBe(true);
    expect(sim.requestAttack("warrior", TARGET)?.ok).toBe(true);
    run(sim, 4);
    const worn = health(sim) ?? 0;
    expect(worn).toBeLessThan(300);
    expect(worn).toBeGreaterThan(0);
    run(sim, 30);
    expect(health(sim)).toBe(0);
    expect(sim.get("warrior")?.combatant.attack).toBeUndefined();
    run(sim, 5);
    expect(health(sim)).toBe(0);
    expect(sim.setTarget("warrior", TARGET)).toBe(false);
  });

  it("is worn down by a ranger's arrows", () => {
    const sim = arena([
      fighter("ranger", 0, RANGER, vec2(100, 400), { behaviour: undefined }),
      FOE,
    ]);
    sim.requestAttack("ranger", TARGET);
    run(sim, 6);
    expect(health(sim) ?? 300).toBeLessThan(300);
  });

  it("takes only a hex skill's damage, and refuses a hex that deals none", () => {
    const sim = arena([
      caster("hexer", "elementalist.mind-freeze", "elementalist.water-magic"),
      FOE,
    ]);
    sim.setTarget("hexer", TARGET);
    expect(sim.requestSkill("hexer", 0)?.check.ok).toBe(true);
    run(sim, 3);
    expect(health(sim) ?? 300).toBeLessThan(300);

    const curser = arena([
      caster("curser", "necromancer.faintheartedness", "necromancer.curses"),
      FOE,
    ]);
    curser.setTarget("curser", TARGET);
    expect(curser.requestSkill("curser", 0)?.check).toEqual({
      ok: false,
      reason: "invalid-target-wall",
    });
  });

  it("blocks a walk while it stands, and opens the way once it crumbles", () => {
    const tough = arena([body("walker", 0, vec2(300, 400)), FOE]);
    tough.walkTo("walker", vec2(500, 400));
    run(tough, 3);
    expect(tough.get("walker")?.position.x).toBeLessThan(396);

    const weak = arena(
      [
        fighter("warrior", 0, WARRIOR, vec2(300, 300), { behaviour: undefined }),
        body("walker", 0, vec2(300, 500)),
        FOE,
      ],
      { ...WALL, maxHealth: 100 },
    );
    weak.requestAttack("warrior", TARGET);
    run(weak, 15);
    expect(health(weak)).toBe(0);
    weak.walkTo("walker", vec2(500, 500));
    run(weak, 3);
    expect(weak.get("walker")?.position.x).toBeGreaterThan(450);
  });
});
