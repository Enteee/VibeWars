import { describe, expect, it } from "vitest";

import { NO_RANKS, type StatusId } from "../../skills/status.js";
import { vec2 } from "../../vec2.js";
import { punishments } from "./punish.js";
import { WARRIOR, fighter, match } from "./rules/test-support.js";

/** What a warrior bearing `statuses` is punished for. */
function punishedBy(...statuses: readonly StatusId[]) {
  const sim = match([fighter("w", 0, WARRIOR, vec2(400, 400))]);
  const self = sim.get("w");
  if (self === undefined) throw new Error("no w");
  for (const status of statuses) self.combatant.statuses.apply(status, 10, "foe", NO_RANKS);
  return punishments(self);
}

describe("punishments (#4199)", () => {
  it("Empathy punishes attacks, 39 a swing", () => {
    expect(punishedBy("empathy")).toEqual({
      attacks: true,
      spells: false,
      skills: false,
      cost: 39,
    });
  });

  it("Backfire punishes spells", () => {
    expect(punishedBy("backfire")).toEqual({
      attacks: false,
      spells: true,
      skills: false,
      cost: 119,
    });
  });

  it("Spiteful Spirit punishes attacks and skills alike", () => {
    expect(punishedBy("spiteful-spirit")).toMatchObject({ attacks: true, skills: true });
  });

  it("Diversion, which only lengthens a recharge, punishes nothing", () => {
    expect(punishedBy("diversion")).toEqual({
      attacks: false,
      spells: false,
      skills: false,
      cost: 0,
    });
  });

  it("an enchantment answering the bearer's attacks is no punishment", () => {
    expect(punishedBy("vow-of-strength")).toEqual({
      attacks: false,
      spells: false,
      skills: false,
      cost: 0,
    });
  });

  it("no hex, nothing", () => {
    expect(punishedBy()).toEqual({ attacks: false, spells: false, skills: false, cost: 0 });
  });
});
