import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { applyIntent } from "./apply-intent.js";
import { MatchSimulation } from "./simulation.js";

function spec(id: string, team: number, spawn: Vec2) {
  return {
    id,
    team,
    skillBar: ["elementalist.fireball"],
    attributeRanks: new Map([["elementalist.fire-magic", 12]]),
    equipment: unarmedResolvedEquipment(MINIMAL_GW_INSPIRED_PVP_V1.combat.armorReferenceLevel),
    spawn,
    facing: 0,
  };
}

/** a and b, far out of each other's reach. */
function duel(): MatchSimulation {
  return new MatchSimulation({
    seed: "intents",
    participants: [spec("a", 0, vec2(0, 0)), spec("b", 1, vec2(5000, 0))],
  });
}

describe("applyIntent", () => {
  it("moves, stops, targets, walks and cancels", () => {
    const sim = duel();
    expect(applyIntent(sim, "a", { kind: "move", dirX: 1, dirY: 0 })).toBeNull();
    sim.step(0.05);
    expect(sim.get("a")?.position.x).toBeGreaterThan(0);
    applyIntent(sim, "a", { kind: "stop" });
    const stopped = sim.get("a")?.position.x;
    sim.step(0.05);
    expect(sim.get("a")?.position.x).toBe(stopped);
    applyIntent(sim, "a", { kind: "target", targetSessionId: "b" });
    expect(sim.get("a")?.targetId).toBe("b");
    applyIntent(sim, "a", { kind: "target", targetSessionId: null });
    expect(sim.get("a")?.targetId).toBeUndefined();
    applyIntent(sim, "a", { kind: "walk-to", x: 100, y: 0 });
    expect(sim.get("a")?.walkGoal).toBeDefined();
    applyIntent(sim, "a", { kind: "cancel" });
  });

  it("returns the refusal for a cast or an attack the simulation turns down", () => {
    const sim = duel();
    applyIntent(sim, "a", { kind: "target", targetSessionId: "a" });
    expect(applyIntent(sim, "a", { kind: "use-skill", slot: 0 })).toEqual({
      kind: "skill",
      slot: 0,
      skillId: "elementalist.fireball",
      reason: "invalid-target-self",
    });
    expect(applyIntent(sim, "a", { kind: "attack", targetId: "a" })).toEqual({
      kind: "attack",
      reason: "invalid-target-self",
    });
  });

  it("swaps a weapon set quietly, an empty one refused without a word (#489)", () => {
    const sword = unarmedResolvedEquipment(MINIMAL_GW_INSPIRED_PVP_V1.combat.armorReferenceLevel);
    const axe = {
      equipment: {
        ...sword,
        mainHand: {
          weapon: WEAPONS.axe,
          attributeId: undefined,
          damageType: WEAPONS.axe.damageType,
          requirementMet: true,
        },
      },
      maxEnergy: 20,
    };
    const sim = new MatchSimulation({
      seed: "intents",
      participants: [
        { ...spec("a", 0, vec2(0, 0)), spareWeaponSets: [axe, null, null] },
        spec("b", 1, vec2(5000, 0)),
      ],
    });
    expect(applyIntent(sim, "a", { kind: "weapon-set", set: 1 })).toBeNull();
    expect(sim.get("a")?.activeWeaponSet).toBe(1);
    expect(sim.get("a")?.combatant.equipment.mainHand.weapon.id).toBe("axe");
    expect(applyIntent(sim, "a", { kind: "weapon-set", set: 2 })).toBeNull();
    expect(sim.get("a")?.activeWeaponSet).toBe(1);
  });

  it("does nothing for a player the simulation does not know", () => {
    const sim = duel();
    expect(applyIntent(sim, "ghost", { kind: "use-skill", slot: 0 })).toBeNull();
  });
});
