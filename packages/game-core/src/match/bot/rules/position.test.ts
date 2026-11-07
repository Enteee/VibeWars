import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../../../distances.js";
import { distance, vec2 } from "../../../vec2.js";
import position from "./position.js";
import { POSITION_SLACK } from "./shared.js";
import { ELEMENTALIST, MONK, WARRIOR, fighter, match, ruleFor } from "./test-support.js";

describe("position (#2545)", () => {
  const FOE = vec2(1200, 400);
  const ranged = (x: number) =>
    match([fighter("e", 0, ELEMENTALIST, vec2(x, 400)), fighter("foe", 1, WARRIOR, FOE)]);

  it("walks a ranged bot in to the edge of its reach, and no nearer", () => {
    const far = ruleFor(ranged(100), "e", { targetId: "foe" });
    expect(far.role).toBe("ranged");
    const spot = position.decide(far)?.moveTo;
    if (spot === undefined) throw new Error("no spot");
    expect(spot.y).toBeCloseTo(400);
    expect(spot.x).toBeGreaterThan(100);
    expect(distance(spot, FOE)).toBeLessThan(RANGE_SPELL * 2);

    // At its spot, and within slack of it, it holds.
    for (const x of [spot.x, spot.x - POSITION_SLACK / 2]) {
      expect(position.decide(ruleFor(ranged(x), "e", { targetId: "foe" }))).toBeUndefined();
    }
    // Nearer than its spot, it does not back off: it stands and fights.
    expect(
      position.decide(ruleFor(ranged(spot.x + 100), "e", { targetId: "foe" })),
    ).toBeUndefined();
  });

  it("does not take a spot it could not see its target from", () => {
    const rule = ruleFor(ranged(100), "e", { targetId: "foe" }, { seesBetween: () => false });
    expect(position.decide(rule)).toBeUndefined();
  });

  it("stands a healer behind its hurt ally, away from the foes", () => {
    const fight = match([
      fighter("m", 0, MONK, vec2(200, 200)),
      fighter("mate", 0, WARRIOR, vec2(700, 400)),
      fighter("whole", 0, WARRIOR, vec2(300, 700)),
      fighter("foe", 1, WARRIOR, vec2(1000, 400)),
    ]);
    const mate = fight.get("mate");
    if (mate !== undefined) mate.combatant.health = mate.combatant.maxHealth * 0.4;
    const rule = ruleFor(fight, "m");
    expect(rule.role).toBe("healer");
    const spot = position.decide(rule)?.moveTo;
    if (spot === undefined) throw new Error("no spot");
    const ward = vec2(700, 400);
    expect(distance(spot, ward)).toBeLessThanOrEqual(0.8 * RANGE_SPELL + 1e-6);
    expect(spot.x).toBeLessThan(ward.x);
    expect(distance(spot, vec2(1000, 400))).toBeGreaterThan(distance(ward, vec2(1000, 400)));
  });

  it("leaves a frontline to close in", () => {
    const fight = match([
      fighter("w", 0, WARRIOR, vec2(100, 400)),
      fighter("foe", 1, WARRIOR, FOE),
    ]);
    expect(position.decide(ruleFor(fight, "w", { targetId: "foe" }))).toBeUndefined();
  });
});
