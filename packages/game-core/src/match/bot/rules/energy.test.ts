import { describe, expect, it } from "vitest";

import { NO_RANKS } from "../../../skills/status.js";
import { vec2 } from "../../../vec2.js";
import type { MatchSimulation } from "../../simulation.js";
import { ELEMENTALIST, WARRIOR, askBot, fighter, match, uses } from "./test-support.js";

describe("play-build gains its own Energy (#2132)", () => {
  const ETHER = "mesmer.ether-signet";
  const LYSSA = "mesmer.lyssas-aura";

  /** A mesmer `m` with only `skillBar` at `energy`, and a foe `foeX` off. */
  function mesmer(skillBar: string[], energy: number, foeX = 300): MatchSimulation {
    const sim = match([
      fighter("m", 0, ELEMENTALIST, vec2(0, 400), {
        skillBar,
        attributeRanks: new Map([["mesmer.inspiration-magic", 12]]),
      }),
      fighter("foe", 1, WARRIOR, vec2(foeX, 400), { behaviour: undefined }),
    ]);
    const self = sim.get("m");
    if (self === undefined) throw new Error("no m");
    self.combatant.energy = energy;
    return sim;
  }

  it("names Energy as the use of both", () => {
    expect(uses(ETHER)).toEqual(["energy"]);
    expect(uses(LYSSA)).toEqual(["energy"]);
  });

  it("Ether Signet below its 9 Energy, not at 9", () => {
    expect(askBot(mesmer([ETHER], 8), "m")).toMatchObject({ useSkillId: ETHER, targetId: "m" });
    expect(askBot(mesmer([ETHER], 9), "m").useSkillId).toBeUndefined();
  });

  it("Lyssa's Aura with a foe in reach of an offensive spell, never one already up", () => {
    const bar = [LYSSA, "mesmer.empathy"];
    expect(askBot(mesmer(bar, 30), "m")).toMatchObject({ useSkillId: LYSSA, targetId: "m" });
    // No foe in reach, or no spell at a foe on the bar to keep it up.
    expect(askBot(mesmer(bar, 30, 1200), "m").useSkillId).not.toBe(LYSSA);
    expect(askBot(mesmer([LYSSA], 30), "m").useSkillId).toBeUndefined();
    const up = mesmer(bar, 30);
    up.get("m")?.combatant.statuses.apply("lyssas-aura", 5, "m", NO_RANKS);
    expect(askBot(up, "m").useSkillId).not.toBe(LYSSA);
  });
});
