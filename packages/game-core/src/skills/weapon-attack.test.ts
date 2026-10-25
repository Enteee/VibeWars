import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { weaponAttributeMultiplier } from "./damage.js";
import type { CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import { doubleStrikeChance, resolveSwing } from "./weapon-attack.js";
import type { Combatant } from "./types.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;

function wielding(weapon: Weapon, attributeId: string | undefined, met = true): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
    mainHand: { weapon, attributeId, requirementMet: met },
  };
}

function attacker(weapon: Weapon, attributeId: string | undefined, rank = 12): Combatant {
  return makeCombatant({
    id: "attacker",
    team: 0,
    equipment: wielding(weapon, attributeId),
    attributeRanks: new Map(attributeId === undefined ? [] : [[attributeId, rank]]),
  });
}

function foe(id: string, position: Vec2 = vec2(40, 0)) {
  return {
    combatant: makeCombatant({ id, team: 1, health: 1e6, maxHealth: 1e6 }),
    position,
  };
}

function damages(events: readonly CombatEvent[]): number[] {
  return events.flatMap((event) => (event.kind === "damage" ? [event.amount] : []));
}

describe("resolveSwing", () => {
  it("rolls the weapon's range at rank 12 against reference armor, and every value appears", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    const target = foe("dummy");
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      const events = resolveSwing({ attacker: sword, target, candidates: [], rng, rules: RULES });
      expect(events).toHaveLength(1);
      seen.add(damages(events)[0] ?? -1);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([15, 16, 17, 18, 19, 20, 21, 22]);
  });

  it("scales by the attribute and by an unmet requirement", () => {
    const rank = 8;
    const weak = attacker(WEAPONS.hammer, "warrior.hammer-mastery", rank);
    const unmet = makeCombatant({
      id: "attacker",
      equipment: wielding(WEAPONS.hammer, "warrior.hammer-mastery", false),
      attributeRanks: new Map([["warrior.hammer-mastery", rank]]),
    });
    const scale = weaponAttributeMultiplier(rank, RULES);
    const rng = createRng(2);
    for (let i = 0; i < 200; i += 1) {
      for (const [who, factor] of [
        [weak, scale],
        [unmet, scale * RULES.unmetRequirementMultiplier],
      ] as const) {
        const [dealt] = damages(
          resolveSwing({ attacker: who, target: foe("dummy"), candidates: [], rng, rules: RULES }),
        );
        expect(dealt).toBeGreaterThanOrEqual(Math.round(19 * factor));
        expect(dealt).toBeLessThanOrEqual(Math.round(35 * factor));
      }
    }
  });

  it("a blind attacker misses 90% of 1000 swings, each one an attack-missed", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.statuses.apply("blind", 1e6, "someone");
    const rng = createRng(3);
    let misses = 0;
    for (let i = 0; i < 1000; i += 1) {
      const events = resolveSwing({
        attacker: sword,
        target: foe("dummy"),
        candidates: [],
        rng,
        rules: RULES,
      });
      expect(events).toHaveLength(1);
      if (events[0]?.kind === "attack-missed") {
        expect(events[0]).toEqual({ kind: "attack-missed", targetId: "dummy" });
        misses += 1;
      } else {
        expect(events[0]?.kind).toBe("damage");
      }
    }
    expect(misses / 1000).toBeGreaterThan(0.87);
    expect(misses / 1000).toBeLessThan(0.93);
  });

  it("daggers strike twice at their chance, with their own rolls", () => {
    const daggers = attacker(WEAPONS.daggers, "assassin.dagger-mastery");
    const chance = doubleStrikeChance(daggers, WEAPONS.daggers);
    expect(chance).toBeCloseTo(0.02 + 0.02 * 12, 9);
    expect(doubleStrikeChance(daggers, WEAPONS.sword)).toBe(0);

    const rng = createRng(4);
    const swings = 4000;
    let doubles = 0;
    for (let i = 0; i < swings; i += 1) {
      const hits = damages(
        resolveSwing({
          attacker: daggers,
          target: foe("dummy"),
          candidates: [],
          rng,
          rules: RULES,
        }),
      );
      expect(hits.length === 1 || hits.length === 2).toBe(true);
      if (hits.length === 2) {
        doubles += 1;
      }
    }
    expect(Math.abs(doubles / swings - chance)).toBeLessThan(0.03);
  });

  it("a scythe cleaves into exactly cleaveTargets adjacent foes, nearest first", () => {
    const scythe = attacker(WEAPONS.scythe, "dervish.scythe-mastery");
    const target = foe("target", vec2(40, 0));
    const candidates = [
      target,
      foe("far", vec2(40, 39)),
      foe("near", vec2(40, 10)),
      foe("mid", vec2(40, -20)),
      foe("outside", vec2(40, 90)),
      { combatant: makeCombatant({ id: "ally", team: 0 }), position: vec2(41, 0) },
      { combatant: scythe, position: vec2(0, 0) },
    ];
    const events = resolveSwing({
      attacker: scythe,
      target,
      candidates,
      rng: createRng(5),
      rules: RULES,
    });
    const hit = events.flatMap((event) => (event.kind === "damage" ? [event.targetId] : []));
    expect(WEAPONS.scythe.cleaveTargets).toBe(2);
    expect(hit).toEqual(["target", "near", "mid"]);
  });

  it("does not hit a corpse", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    const target = foe("dummy");
    target.combatant.dead = true;
    expect(
      resolveSwing({ attacker: sword, target, candidates: [], rng: createRng(6), rules: RULES }),
    ).toEqual([]);
  });
});
