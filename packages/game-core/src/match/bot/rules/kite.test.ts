import { describe, expect, it } from "vitest";

import { distance, normalize, sub, vec2 } from "../../../vec2.js";
import kite from "./kite.js";
import { KITE_DISTANCE } from "./shared.js";
import { ELEMENTALIST, WARRIOR, fighter, match, ruleFor } from "./test-support.js";

describe("kite (#2545)", () => {
  const sim = (foeX: number) =>
    match([
      fighter("e", 0, ELEMENTALIST, vec2(800, 400)),
      fighter("mate", 0, WARRIOR, vec2(800, 700)),
      fighter("foe", 1, WARRIOR, vec2(foeX, 400)),
    ]);

  it("steps away from a foe at its elbow, bent toward its team", () => {
    const fight = sim(850);
    const rule = ruleFor(fight, "e");
    const spot = kite.decide(rule)?.moveTo;
    if (spot === undefined) throw new Error("no kite");
    const foe = vec2(850, 400);
    expect(distance(spot, foe)).toBeCloseTo(1.5 * KITE_DISTANCE);
    const way = normalize(sub(spot, foe));
    // Away from the foe, and toward its team's side (+y).
    expect(way.x).toBeLessThan(0);
    expect(way.y).toBeGreaterThan(0);
  });

  it("stays put with no foe within its distance", () => {
    expect(kite.decide(ruleFor(sim(950), "e"))).toBeUndefined();
  });

  it("is a ranged bot's or a healer's: a frontline never kites", () => {
    expect(kite.decide(ruleFor(sim(850), "mate", {}))).toBeUndefined();
    const warrior = match([
      fighter("w", 0, WARRIOR, vec2(800, 400)),
      fighter("foe", 1, WARRIOR, vec2(830, 400)),
    ]);
    expect(kite.decide(ruleFor(warrior, "w"))).toBeUndefined();
  });

  it("not while resting from its last kite", () => {
    expect(kite.decide(ruleFor(sim(850), "e", { mayKite: false }))).toBeUndefined();
  });

  it("cornered, it stays and fights", () => {
    const rule = ruleFor(sim(850), "e", {}, { walkable: () => false });
    expect(kite.decide(rule)).toBeUndefined();
  });

  it("short of a wall, it stops at the last point it can reach", () => {
    const rule = ruleFor(sim(850), "e", {}, { walkable: ({ x }) => x >= 760 });
    const spot = kite.decide(rule)?.moveTo;
    expect(spot?.x).toBeGreaterThanOrEqual(760);
    expect(spot?.x).toBeLessThan(800);
  });
});
