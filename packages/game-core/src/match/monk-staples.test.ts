import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { BASE_ENERGY_PIPS_BY_PROFESSION } from "../equipment/armor.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Reversal of Fortune in a match (#987): a Warrior's axe blow on the
 * bearer heals it, and its next blow damages.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

const AXE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.axe,
    attributeId: "warrior.axe-mastery",
    damageType: WEAPONS.axe.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map([["warrior.axe-mastery", 12]]),
    equipment: AXE,
    spawn,
    facing: 0,
    baseEnergyPips: BASE_ENERGY_PIPS_BY_PROFESSION.warrior,
  };
}

describe("Reversal of Fortune in a match (#987)", () => {
  it("a Warrior's blow on the bearer heals it, and the next blow damages", () => {
    const sim = new MatchSimulation({
      seed: "reversal",
      participants: [spec("w", 0, vec2(0, 0)), spec("ally", 1, vec2(AREA_ADJACENT - 10, 0))],
    });
    const target = sim.get("ally")?.combatant;
    if (target === undefined) {
      throw new Error("no ally");
    }
    target.maxHealth = 1000;
    target.health = 500;
    target.statuses.apply("reversal-of-fortune", 8, "monk", NO_RANKS);
    expect(sim.requestAttack("w", "ally")).toEqual({ ok: true });

    let tick = 0;
    for (; target.statuses.has("reversal-of-fortune") && tick < 3 / DT; tick += 1) {
      sim.step(DT);
    }
    expect(target.statuses.has("reversal-of-fortune")).toBe(false);
    const healed = target.health;
    expect(healed).toBeGreaterThan(500);
    expect(healed).toBeLessThanOrEqual(567);

    for (; target.health >= healed && tick < 6 / DT; tick += 1) {
      sim.step(DT);
    }
    expect(target.health).toBeLessThan(healed);
  });
});
