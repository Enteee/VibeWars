import { describe, expect, it } from "vitest";

import { hasLineOfSight, segment, type Segment } from "../../geometry.js";
import { vec2 } from "../../vec2.js";
import { MatchSimulation } from "../simulation.js";
import { BOUNDS, DT, ELEMENTALIST, MONK, RANGER, RULESET, fighter } from "./rules/test-support.js";

const PILLAR_AT = { x: 890, y: 310, size: 40 };

function rect(x: number, y: number, width: number, height: number): Segment[] {
  const a = vec2(x, y);
  const b = vec2(x + width, y);
  const c = vec2(x + width, y + height);
  const d = vec2(x, y + height);
  return [segment(a, b), segment(b, c), segment(c, d), segment(d, a)];
}

/** A player who stands still: the foes keep the geometry fixed. */
const STILL = { behaviour: undefined };

const PILLAR = rect(PILLAR_AT.x, PILLAR_AT.y, PILLAR_AT.size, PILLAR_AT.size);

/**
 * 2v2 (#2598): a ranged bot and its healer against two ranged foes, one
 * pillar between. Straight back from its target, both foes reach it; the
 * spot turned 20° north is as far from its target, and the pillar hides
 * it from the Ranger.
 */
function fight(): MatchSimulation {
  return new MatchSimulation({
    seed: "cover",
    ruleset: RULESET,
    bounds: BOUNDS,
    walls: PILLAR,
    participants: [
      fighter("e0", 0, ELEMENTALIST, vec2(200, 300)),
      fighter("m0", 0, MONK, vec2(100, 300)),
      fighter("e1", 1, ELEMENTALIST, vec2(1100, 300), STILL),
      fighter("r1", 1, RANGER, vec2(1100, 500), STILL),
    ],
  });
}

/** Where `e0` stands each tick for `seconds`, and whether the pillar hides it from a living foe. */
function play(seconds: number) {
  const sim = fight();
  const trail: string[] = [];
  let hiddenAt: number | undefined;
  for (let t = 0; t < seconds; t += DT) {
    sim.step(DT);
    const self = sim.get("e0");
    if (self === undefined) throw new Error("no e0");
    trail.push(`${String(self.position.x)},${String(self.position.y)}`);
    const hidden = ["e1", "r1"].some((id) => {
      const foe = sim.get(id);
      return (
        foe !== undefined &&
        !foe.combatant.dead &&
        !hasLineOfSight(foe.position, self.position, PILLAR)
      );
    });
    if (hidden && hiddenAt === undefined) hiddenAt = t;
  }
  return { trail, hiddenAt };
}

describe("ranged bots take cover (#2598)", () => {
  it("stands where the pillar hides it from a foe within 5 s", () => {
    expect(play(5).hiddenAt).toBeDefined();
  });

  it("walks the same way twice from the same seed", () => {
    expect(play(5).trail).toEqual(play(5).trail);
  });
});
