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

  it("swaps weapon sets, and says nothing for an empty one (#489)", () => {
    const base = unarmedResolvedEquipment(MINIMAL_GW_INSPIRED_PVP_V1.combat.armorReferenceLevel);
    const bow = {
      ...base,
      mainHand: {
        weapon: WEAPONS["recurve-bow"],
        attributeId: "ranger.marksmanship",
        damageType: WEAPONS["recurve-bow"].damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    };
    const sim = new MatchSimulation({
      seed: "intents",
      participants: [
        {
          ...spec("a", 0, vec2(0, 0)),
          spareWeaponSets: [
            { equipment: bow, maxEnergy: 20, maxHealth: 500, baseEnergyPips: 0 },
            null,
            null,
          ],
        },
      ],
    });
    expect(applyIntent(sim, "a", { kind: "weapon-set", set: 1 })).toBeNull();
    expect(sim.get("a")?.activeWeaponSet).toBe(1);
    expect(sim.get("a")?.combatant.equipment.mainHand.weapon.id).toBe("recurve-bow");
    expect(applyIntent(sim, "a", { kind: "weapon-set", set: 2 })).toBeNull();
    expect(sim.get("a")?.activeWeaponSet).toBe(1);
  });

  it("does nothing for a player the simulation does not know", () => {
    const sim = duel();
    expect(applyIntent(sim, "ghost", { kind: "use-skill", slot: 0 })).toBeNull();
  });
});

describe("applyIntent — command (#1110)", () => {
  const heel = { kind: "mode", mode: "heel" } as const;

  /** Ranger `r` with a wolf, foe `b` with one too, and `r`'s Bone Minion `r/m`. */
  function kennel(): MatchSimulation {
    const ranger = (id: string, team: number, spawn: Vec2) => ({
      ...spec(id, team, spawn),
      skillBar: ["ranger.charm-animal"],
      attributeRanks: new Map([["ranger.beast-mastery", 12]]),
    });
    return new MatchSimulation({
      seed: "intents",
      participants: [
        ranger("r", 0, vec2(0, 0)),
        ranger("b", 1, vec2(5000, 0)),
        {
          ...spec("r/m", 0, vec2(50, 0)),
          creature: {
            ownerId: "r",
            kind: "minion",
            look: "bone-minion",
            name: "Bone Minion",
            expiresInSeconds: Number.POSITIVE_INFINITY,
            ageSeconds: 0,
            summonedAtTick: 0,
            skillId: "necromancer.animate-bone-minions",
            aura: undefined,
            onDeath: "vanish",
            ownerDisableSeconds: 0,
            deathBurst: undefined,
            onDeathInRange: undefined,
            replacedBy: undefined,
            corpsesLeft: 0,
            companionSkillId: undefined,
            leaderId: undefined,
            mode: "guard",
          },
        },
      ],
    });
  }

  function wolfOf(sim: MatchSimulation, ownerId: string): string {
    const wolf = [...sim.participants()].find(
      (other) => other.creature?.ownerId === ownerId && other.creature.kind === "pet",
    );
    if (wolf === undefined) {
      throw new Error(`${ownerId} has no wolf`);
    }
    return wolf.id;
  }

  it("sets the owner's own companion's mode", () => {
    const sim = kennel();
    const id = wolfOf(sim, "r");
    expect(sim.get(id)?.creature?.mode).toBe("guard");
    expect(applyIntent(sim, "r", { kind: "command", creatureId: id, order: heel })).toBeNull();
    expect(sim.get(id)?.creature?.mode).toBe("heel");
  });

  it("leaves anyone else's companion, a minion, a player and an unknown id as they were", () => {
    const sim = kennel();
    const id = wolfOf(sim, "r");
    expect(applyIntent(sim, "b", { kind: "command", creatureId: id, order: heel })).toBeNull();
    expect(sim.get(id)?.creature?.mode).toBe("guard");
    applyIntent(sim, "r", { kind: "command", creatureId: "r/m", order: heel });
    expect(sim.get("r/m")?.creature?.mode).toBe("guard");
    expect(sim.commandCreature("r", "r/m", heel)).toBe(false);
    expect(sim.commandCreature("r", "b", heel)).toBe(false);
    expect(sim.commandCreature("r", "nobody", heel)).toBe(false);
  });
});
