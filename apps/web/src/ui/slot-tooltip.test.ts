import { getSkill, type Skill } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { slotDescription } from "./slot-tooltip.js";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

function slot(id: string, energyCost: number, adrenalineCost = 0) {
  return {
    id,
    name: id,
    energyCost,
    adrenalineCost,
    activationSeconds: 1,
    rechargeSeconds: 7,
  };
}

describe("slotDescription (#719)", () => {
  it("prices the slot as the host sent it, the base in brackets when they differ (#637)", () => {
    const armor = skill("elementalist.armor-of-earth");
    expect(slotDescription(armor, slot(armor.id, 10), new Map()).cost).toBe("10 energy");
    expect(slotDescription(armor, slot(armor.id, 0), new Map()).cost).toBe("0 energy (10)");
  });

  it("leaves an adrenaline skill's cost as the description says it", () => {
    const backbreaker = skill("warrior.backbreaker");
    expect(slotDescription(backbreaker, slot(backbreaker.id, 0, 9), new Map()).cost).toBe(
      "9 adrenaline",
    );
  });
});
