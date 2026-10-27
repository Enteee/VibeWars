import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, RANGE_SPELL } from "../distances.js";
import { BASE_ENERGY_PIPS_BY_PROFESSION } from "../equipment/armor.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const WEAKEN_ARMOR = "necromancer.weaken-armor";
const MEND = "monk.mend-condition";

function spec(id: string, team: number, spawn: Vec2, skillBar: readonly string[] = []) {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([
      ["necromancer.curses", 12],
      ["monk.protection-prayers", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    baseEnergyPips: BASE_ENERGY_PIPS_BY_PROFESSION.necromancer,
  } satisfies ParticipantSpec;
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
  }
}

function cracked(sim: MatchSimulation, id: string): boolean {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant.statuses.has("cracked-armor");
}

/** The necromancer, its target, a foe beside it, a foe further off and the target's ally... */
function field(): MatchSimulation {
  const target = vec2(RANGE_SPELL - 50, 0);
  return new MatchSimulation({
    seed: "weaken-armor",
    participants: [
      spec("necro", 0, vec2(0, 0), [WEAKEN_ARMOR]),
      spec("target", 1, target),
      spec("beside", 1, vec2(target.x, AREA_ADJACENT - 5), [MEND]),
      spec("off", 1, vec2(target.x, AREA_ADJACENT + 20)),
      // ...and the necromancer's own ally, adjacent to the target.
      spec("ally", 0, vec2(target.x, -(AREA_ADJACENT - 5))),
    ],
  });
}

describe("Weaken Armor (#763)", () => {
  it("cracks the target and the foes adjacent to it, no one else", () => {
    const sim = field();
    sim.setTarget("necro", "target");
    expect(sim.requestSkill("necro", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 0.6);
    expect(cracked(sim, "target")).toBe(true);
    expect(cracked(sim, "beside")).toBe(true);
    expect(cracked(sim, "off")).toBe(false);
    expect(cracked(sim, "ally")).toBe(false);
    expect(
      sim.get("target")?.combatant.statuses.get("cracked-armor")?.remainingSeconds,
    ).toBeCloseTo(17, 0);
  });

  it("is a condition, so condition removal takes it off", () => {
    const sim = field();
    sim.setTarget("necro", "target");
    sim.requestSkill("necro", 0);
    stepFor(sim, 0.6);
    expect(cracked(sim, "target")).toBe(true);
    sim.setTarget("beside", "target");
    expect(sim.requestSkill("beside", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 1.1);
    expect(cracked(sim, "target")).toBe(false);
  });

  it("costs what the import says, and says what it does", () => {
    const skill = getSkill(WEAKEN_ARMOR);
    expect(skill?.cost).toEqual({ kind: "energy", amount: 5 });
    expect(skill?.activationSeconds).toBe(0.5);
    expect(skill?.rechargeSeconds).toBe(5);
    expect(describeStatus("cracked-armor")).toBe("−20 armor (not below 60)");
    if (skill !== undefined) {
      expect(JSON.stringify(describeSkill(skill, new Map([["necromancer.curses", 12]])))).toContain(
        "Cracked Armor",
      );
    }
  });
});
