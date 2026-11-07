import { describe, expect, it } from "vitest";

import { vec2 } from "../../../vec2.js";
import rest from "./rest.js";
import { NOTHING } from "./shared.js";
import { WARRIOR, fighter, match, ruleFor } from "./test-support.js";

describe("rest (#2549)", () => {
  /** `w` at `fraction` of its health, a foe `away` east. */
  function rule(fraction: number, away: number) {
    const sim = match([
      fighter("w", 0, WARRIOR, vec2(100, 400)),
      fighter("foe", 1, WARRIOR, vec2(100 + away, 400)),
    ]);
    const w = sim.get("w");
    if (w === undefined) throw new Error("no w");
    w.combatant.health = w.combatant.maxHealth * fraction;
    return ruleFor(sim, "w");
  }

  it("stands a hurt bot still with no foe in reach", () => {
    expect(rest.decide(rule(0.5, 1000))).toBe(NOTHING);
    // Fled out of reach, it rests rather than walk straight back in.
    expect(rest.decide(rule(0.2, 1000))).toBe(NOTHING);
  });

  it("fights a foe in reach, and does not rest once healed enough", () => {
    expect(rest.decide(rule(0.5, 300))).toBeUndefined();
    expect(rest.decide(rule(0.8, 1000))).toBeUndefined();
  });

  it("leaves a guard to its post", () => {
    expect(rest.decide({ ...rule(0.5, 1000), role: undefined })).toBeUndefined();
  });
});
