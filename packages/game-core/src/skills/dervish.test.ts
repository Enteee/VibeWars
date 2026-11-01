import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { canActivate, payCost } from "./activation.js";
import { IMPLEMENTED_SKILLS, getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, STATUS_DEFINITIONS, aggregateModifiers, type StatusId } from "./status.js";
import { chargeAdrenaline, makeCombatant, strikesOf } from "./testing.js";
import { attackDurationSeconds, resolveAttackSkill } from "./weapon-attack.js";
import type { Combatant, Skill, SkillEffect } from "./types.js";

/**
 * The Dervish's enchantments and the skills that spend one (#845), each
 * cast the way the simulation casts it: checked, paid, then resolved.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const NOWHERE = (): boolean => false;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A stream that rolls `roll` and floats `float`: 0.95 never blocks, 0.1 always does. */
const steady = (roll = 10, float = 0.95): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => float });

function holding(id: string, team: number, weapon: Weapon, attributeId: string): Combatant {
  return makeCombatant({
    id,
    team,
    equipment: {
      ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
      mainHand: {
        weapon,
        attributeId,
        damageType: weapon.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    attributeRanks: new Map([
      [attributeId, 12],
      ["dervish.earth-prayers", 12],
      ["dervish.wind-prayers", 12],
      ["dervish.mysticism", 12],
    ]),
  });
}

const dervish = (): Combatant => holding("d", 0, WEAPONS.scythe, "dervish.scythe-mastery");
const foe = (id = "f"): Combatant => makeCombatant({ id, team: 1, health: 1e6, maxHealth: 1e6 });

function check(caster: Combatant, id: string, target: Combatant) {
  return canActivate({
    skill: skill(id),
    caster,
    casterPosition: vec2(0, 0),
    target,
    targetPosition: vec2(target === caster ? 0 : RANGE_MELEE, 0),
    targetCreatureKind: undefined,
    targetCreatureOwnerId: undefined,
    rechargeRemaining: new Map(),
    spent: new Set(),
    isCasting: false,
    skillBar: [id, null, null, null, null, null, null, null],
    losBlockers: [],
  });
}

/** A non-attack skill cast at `target`, after its check and its cost. */
function cast(caster: Combatant, id: string, target = caster): CombatEvent[] {
  expect(check(caster, id, target)).toEqual({ ok: true });
  payCost(skill(id), caster);
  return applySkillEffects({
    surroundings: new Map(),
    skill: skill(id),
    caster,
    targets: [target],
    rng: createRng(1),
    rules: RULES,
  });
}

/** Wounding Strike at `target`. */
function strike(caster: Combatant, target: Combatant, rng = steady()): CombatEvent[] {
  const id = "dervish.wounding-strike";
  expect(check(caster, id, target)).toEqual({ ok: true });
  payCost(skill(id), caster);
  return resolveAttackSkill(
    { surroundings: new Map(), skill: skill(id), caster, targets: [target], rng, rules: RULES },
    NOWHERE,
    [],
  );
}

const statusesOf = (combatant: Combatant): string[] =>
  combatant.statuses.active.map((status) => status.id);

describe("Mystic Regeneration (#845)", () => {
  it("gives +3 pips for each enchantment on you, itself included, at most 3", () => {
    const caster = dervish();
    cast(caster, "dervish.mystic-regeneration");
    expect(caster.statuses.get("mystic-regeneration")?.remainingSeconds).toBe(17);
    expect(aggregateModifiers(caster.statuses.active).healthPips).toBe(3);

    caster.statuses.apply("guardian", 10, "monk", NO_RANKS);
    cast(caster, "dervish.fleeting-stability");
    expect(aggregateModifiers(caster.statuses.active).healthPips).toBe(9);
    caster.statuses.apply("armor-boost", 10, "ele", NO_RANKS);
    expect(aggregateModifiers(caster.statuses.active).healthPips).toBe(9);
  });

  it("recounts at once when one is lost", () => {
    const caster = dervish();
    cast(caster, "dervish.mystic-regeneration");
    cast(caster, "dervish.fleeting-stability");
    expect(aggregateModifiers(caster.statuses.active).healthPips).toBe(6);
    strike(caster, foe());
    expect(statusesOf(caster)).toEqual(["mystic-regeneration"]);
    expect(aggregateModifiers(caster.statuses.active).healthPips).toBe(3);
  });
});

describe("Wounding Strike (#845)", () => {
  it("with a Dervish enchantment up: Bleeding, the newest lost, and a Deep Wound", () => {
    const caster = dervish();
    cast(caster, "dervish.mystic-regeneration");
    cast(caster, "dervish.fleeting-stability");
    const target = foe();
    const events = strike(caster, target);
    expect(events).toContainEqual({
      kind: "status-removed",
      targetId: "d",
      statusId: "fleeting-stability",
      sourceSkillId: "dervish.fleeting-stability",
    });
    expect(statusesOf(target)).toEqual(["bleeding", "deep-wound"]);
    expect(target.statuses.get("deep-wound")?.remainingSeconds).toBe(17);
    expect(statusesOf(caster)).toEqual(["mystic-regeneration"]);
  });

  it("with none: Bleeding alone, and a Monk's enchantment kept", () => {
    const caster = dervish();
    caster.statuses.apply("guardian", 10, "monk", NO_RANKS);
    const target = foe();
    strike(caster, target);
    expect(statusesOf(target)).toEqual(["bleeding"]);
    expect(statusesOf(caster)).toEqual(["guardian"]);
  });

  it("blocked: nothing lost, nothing applied", () => {
    const caster = dervish();
    cast(caster, "dervish.fleeting-stability");
    const target = foe();
    target.statuses.apply("guardian", 10, "monk", NO_RANKS);
    const events = strike(caster, target, steady(10, 0.1));
    expect(events).toContainEqual({ kind: "attack-blocked", targetId: "f" });
    expect(statusesOf(caster)).toEqual(["fleeting-stability"]);
    expect(statusesOf(target)).toEqual(["guardian"]);
  });

  it("missed: nothing lost", () => {
    const caster = dervish();
    cast(caster, "dervish.fleeting-stability");
    caster.statuses.apply("blind", 10, "foe", NO_RANKS);
    const events = strike(caster, foe(), steady(10, 0.5));
    expect(events).toContainEqual({ kind: "attack-missed", targetId: "f" });
    expect(caster.statuses.has("fleeting-stability")).toBe(true);
  });
});

describe("Pious Restoration (#845)", () => {
  function hexed(): Combatant {
    const caster = dervish();
    caster.health = 100;
    for (const hex of ["faintheartedness", "malaise"] as const) {
      caster.statuses.apply(hex, 10, "necro", NO_RANKS);
    }
    return caster;
  }

  it("with a Dervish enchantment: heals 136, loses it, and up to 3 hexes", () => {
    const caster = hexed();
    cast(caster, "dervish.fleeting-stability");
    cast(caster, "dervish.pious-restoration");
    expect(caster.health).toBe(236);
    expect(statusesOf(caster)).toEqual([]);
  });

  it("without: heals, and the hexes stay", () => {
    const caster = hexed();
    cast(caster, "dervish.pious-restoration");
    expect(caster.health).toBe(236);
    expect(statusesOf(caster)).toEqual(["faintheartedness", "malaise"]);
  });

  it("with no hexes: heals and loses the enchantment, nothing else", () => {
    const caster = dervish();
    caster.health = 100;
    cast(caster, "dervish.fleeting-stability");
    caster.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    cast(caster, "dervish.pious-restoration");
    expect(statusesOf(caster)).toEqual(["bleeding"]);
  });
});

describe("Fleeting Stability (#845)", () => {
  it("you move 25% faster; the first knockdown does nothing and ends it, the next lands", () => {
    const caster = dervish();
    cast(caster, "dervish.fleeting-stability");
    expect(caster.statuses.get("fleeting-stability")?.remainingSeconds).toBe(9);
    expect(aggregateModifiers(caster.statuses.active).moveSpeedMultiplier).toBe(1.25);

    const warrior = holding("w", 1, WEAPONS.hammer, "warrior.hammer-mastery");
    const backbreak = (): CombatEvent[] => {
      payCost(skill("warrior.backbreaker"), warrior);
      return resolveAttackSkill(
        {
          surroundings: new Map(),
          skill: skill("warrior.backbreaker"),
          caster: warrior,
          targets: [caster],
          rng: steady(),
          rules: RULES,
        },
        NOWHERE,
        [],
      );
    };
    chargeAdrenaline(warrior, "warrior.backbreaker");
    expect(backbreak()).toContainEqual({
      kind: "status-removed",
      targetId: "d",
      statusId: "fleeting-stability",
    });
    expect(caster.knockdownRemaining).toBe(0);
    chargeAdrenaline(warrior, "warrior.backbreaker");
    backbreak();
    expect(caster.knockdownRemaining).toBeGreaterThan(0);
  });
});

describe("Heart of Fury (#845)", () => {
  it("you attack 25% faster, and it ends Sprint", () => {
    const caster = dervish();
    caster.statuses.apply("sprint", 10, "d", NO_RANKS);
    const swing = WEAPONS.scythe.attackIntervalSeconds;
    expect(attackDurationSeconds(caster, swing)).toBe(swing);
    chargeAdrenaline(caster, "dervish.heart-of-fury");
    cast(caster, "dervish.heart-of-fury");
    // Paid from its own strikes (#463).
    expect(strikesOf(caster, "dervish.heart-of-fury")).toBe(0);
    expect(statusesOf(caster)).toEqual(["heart-of-fury"]);
    expect(caster.statuses.get("heart-of-fury")?.remainingSeconds).toBe(8);
    expect(attackDurationSeconds(caster, swing)).toBeCloseTo(swing * 0.75);
  });
});

describe("Signet of Pious Light (#845)", () => {
  function dervishes(): MatchSimulation {
    const spec = (id: string, x: number): ParticipantSpec => ({
      id,
      team: 0,
      skillBar: ["dervish.signet-of-pious-light", "dervish.fleeting-stability"],
      attributeRanks: new Map([["dervish.earth-prayers", 12]]),
      equipment: unarmedResolvedEquipment(RULES.armorReferenceLevel),
      spawn: vec2(x, 0),
      facing: 0,
    });
    return new MatchSimulation({ seed: "pious", participants: [spec("d", 0), spec("ally", 60)] });
  }
  const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;

  function signet(enchanted: boolean): { match: MatchSimulation; log: CombatEvent[] } {
    const match = dervishes();
    const self = match.get("d");
    const ally = match.get("ally");
    if (self === undefined || ally === undefined) {
      throw new Error("no dervishes");
    }
    ally.combatant.health = 100;
    if (enchanted) {
      expect(match.requestSkill("d", 1)?.check).toEqual({ ok: true });
      match.step(DT);
    }
    match.setTarget("d", "ally");
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
    const log: CombatEvent[] = [];
    for (let i = 0; i < 40; i += 1) {
      log.push(...match.step(DT).log.flatMap((entry) => entry.events));
    }
    return { match, log };
  }

  it("heals the ally 126; losing an enchantment, it recharges 75% faster: 5 s, not 20", () => {
    const { match, log } = signet(true);
    const self = match.get("d")?.combatant;
    expect(log).toContainEqual({ kind: "heal", targetId: "ally", amount: 126 });
    expect(self?.statuses.has("fleeting-stability")).toBe(false);
    expect(self?.cast.rechargeTotal.get("dervish.signet-of-pious-light")).toBe(5);
    expect(self?.cast.rechargeRemaining.get("dervish.signet-of-pious-light")).toBeLessThan(5);
  });

  it("with none to lose: it heals all the same, and recharges in 20 s", () => {
    const { match, log } = signet(false);
    expect(log).toContainEqual({ kind: "heal", targetId: "ally", amount: 126 });
    expect(match.get("d")?.combatant.cast.rechargeTotal.get("dervish.signet-of-pious-light")).toBe(
      20,
    );
  });

  it("on yourself: heals you and still loses your enchantment", () => {
    const caster = dervish();
    caster.health = 100;
    cast(caster, "dervish.fleeting-stability");
    cast(caster, "dervish.signet-of-pious-light");
    expect(caster.health).toBe(226);
    expect(statusesOf(caster)).toEqual([]);
  });
});

describe("Dervish catalog (#845)", () => {
  it("every self-owned status a skill applies is that skill's profession's", () => {
    const owned = (effect: SkillEffect): StatusId[] =>
      effect.kind === "if"
        ? effect.effects.flatMap(owned)
        : effect.kind === "apply-status" &&
            STATUS_DEFINITIONS[effect.statusId].category !== "condition"
          ? [effect.statusId]
          : [];
    for (const each of IMPLEMENTED_SKILLS) {
      const ids = [
        ...each.effects.flatMap(owned),
        ...(each.whileActivating === undefined ? [] : [each.whileActivating]),
      ];
      for (const id of ids) {
        expect(STATUS_DEFINITIONS[id].profession, `${each.id} ${id}`).toBe(each.profession);
      }
    }
  });

  it("says the loss and what hangs on it in the tooltip", () => {
    const lines = describeSkill(skill("dervish.signet-of-pious-light"), new Map()).effects.map(
      (line) => line.text,
    );
    expect(lines).toEqual([
      "Lose 1 Dervish enchantment",
      expect.stringMatching(/^Heals for \d+$/),
      "If an enchantment was removed: this skill recharges 75% faster",
    ]);
  });
});
