import { describe, expect, it } from "vitest";

import { vec2 } from "../../../vec2.js";
import { pressed } from "./shared.js";
import { fighter, match, RANGER, ruleFor, WARRIOR } from "./test-support.js";

/** A longbow's reach: well past `RANGE_SPELL`. */
const LONGBOW = 600;

describe("pressed (#3150)", () => {
  /** `e` with an ally, and a foe at `x` targeting `target`, out to a longbow's reach. */
  function shooter(x: number, target: string | undefined, sees = true) {
    const sim = match([
      fighter("e", 0, WARRIOR, vec2(100, 400)),
      fighter("ally", 0, WARRIOR, vec2(100, 300)),
      fighter("foe", 1, RANGER, vec2(x, 400)),
    ]);
    const foe = sim.get("foe");
    if (foe === undefined) throw new Error("no foe");
    foe.targetId = target;
    return ruleFor(sim, "e", { foeReach: () => LONGBOW }, { seesBetween: () => sees });
  }

  it("is pressed by a foe shooting at it from beyond 420 that sees it", () => {
    expect(pressed(shooter(600, "e"))).toBe(true);
  });

  it("is not pressed by that foe shooting at an ally", () => {
    expect(pressed(shooter(600, "ally"))).toBe(false);
  });

  it("is not pressed by that foe behind a wall", () => {
    expect(pressed(shooter(600, "e", false))).toBe(false);
  });

  it("is not pressed by that foe out of its own reach", () => {
    expect(pressed(shooter(800, "e"))).toBe(false);
  });

  it("is pressed by a foe within 420, whatever it targets", () => {
    expect(pressed(shooter(400, undefined))).toBe(true);
  });
});
