import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { targetRuleAllows } from "../skills/activation.js";
import { getSkill } from "../skills/catalog.js";
import { effectiveArmor, skillDamage } from "../skills/damage.js";
import {
  NO_RANKS,
  aggregateModifiers,
  getStatusDefinition,
  type StatusId,
} from "../skills/status.js";
import { isSpell } from "../skills/types.js";
import { attackDurationSeconds } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Paragon echoes (#1423): a refrain renews and a finale fires whenever a
 * chant or a shout ends on its bearer, by expiry, an "ends when" rule or
 * a removal; never on a refresh, never on a dead bearer, and nothing
 * strips an echo.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** A chant with no effect on these tests: its end is all they need. */
const CHANT: StatusId = "defensive-anthem";
/** A shout that ends when its bearer hits. */
const FALL_BACK: StatusId = "fall-back";
/** The finale these tests watch fire: 63 Health each time, at rank 12. */
const FINALE: StatusId = "finale-of-restoration";
const HEAL = 63;

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/**
 * A rank-12 Leadership and Motivation paragon "p" with `bar`; its ally
 * "a", an axe warrior; and a foe "f" beside the ally, with more Health.
 */
function match(bar: readonly string[] = []): MatchSimulation {
  return new MatchSimulation({
    seed: "paragon-echoes",
    participants: [
      spec("p", 0, vec2(0, 0), {
        skillBar: [...bar],
        attributeRanks: new Map([
          ["paragon.leadership", 12],
          ["paragon.motivation", 12],
        ]),
        maxEnergy: 100,
      }),
      spec("a", 0, vec2(100, 0), {
        equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
        attributeRanks: new Map([["warrior.axe-mastery", 12]]),
      }),
      spec("f", 1, vec2(130, 0), { maxHealth: 1e6 }),
    ],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    sim.step(DT);
  }
}

/** `id` on "a", from "p", for `seconds`. */
function put(sim: MatchSimulation, id: StatusId, seconds: number, on = "a"): void {
  get(sim, on).combatant.statuses.apply(id, seconds, "p", NO_RANKS);
}

/** A chant ends on "a" by running out, over the next 0.5 s. */
function chantEnds(sim: MatchSimulation): void {
  put(sim, CHANT, 0.2);
  stepFor(sim, 0.5);
}

function remaining(sim: MatchSimulation, id: StatusId, on = "a"): number | undefined {
  return get(sim, on).combatant.statuses.get(id)?.remainingSeconds;
}

/** "p" casts `skillId`, its only skill, on `targetId`, and finishes it. */
function cast(skillId: string, targetId = "a"): MatchSimulation {
  const sim = match([skillId]);
  sim.setTarget("p", targetId);
  expect(sim.requestSkill("p", 0)?.check).toEqual({ ok: true });
  stepFor(sim, 1.5);
  return sim;
}

describe("an echo (#1423)", () => {
  it("renews to full whenever a chant runs out on its bearer", () => {
    const sim = match();
    put(sim, "hasty-refrain", 18);
    stepFor(sim, 5);
    expect(remaining(sim, "hasty-refrain")).toBeLessThan(13.1);
    chantEnds(sim);
    expect(remaining(sim, "hasty-refrain")).toBeGreaterThan(17.5);
  });

  it("fires its finale when a shout ends by its rule: Fall Back! on a hit", () => {
    const sim = match();
    put(sim, FINALE, 30);
    put(sim, FALL_BACK, 9);
    const ally = get(sim, "a").combatant;
    ally.health = 100;
    expect(sim.requestAttack("a", "f")?.ok).toBe(true);
    stepFor(sim, 3);
    expect(ally.statuses.has(FALL_BACK)).toBe(false);
    expect(ally.health).toBeGreaterThanOrEqual(100 + HEAL);
  });

  it("fires its finale when a chant is removed", () => {
    const sim = match();
    put(sim, FINALE, 30);
    put(sim, CHANT, 10);
    const ally = get(sim, "a").combatant;
    ally.health = 100;
    ally.statuses.removeByCategory("chant");
    sim.step(DT);
    expect(ally.health).toBeGreaterThanOrEqual(100 + HEAL);
  });

  it("answers no refresh of a chant, and no end of another category", () => {
    const sim = match();
    put(sim, FINALE, 30);
    put(sim, CHANT, 10);
    put(sim, "regeneration", 0.2);
    const ally = get(sim, "a").combatant;
    ally.health = 100;
    put(sim, CHANT, 10);
    put(sim, CHANT, 20);
    stepFor(sim, 1);
    expect(ally.health).toBeLessThan(100 + HEAL);
    expect(ally.statuses.get(FINALE)?.triggersLeft).toBe(5);
  });

  it("answers nothing on a bearer that died: its echoes ended with it", () => {
    const sim = match();
    put(sim, FINALE, 30);
    put(sim, CHANT, 10);
    const ally = get(sim, "a").combatant;
    ally.statuses.apply("burning", 10, "f", NO_RANKS);
    ally.health = 0.2;
    stepFor(sim, 0.5);
    expect(ally.dead).toBe(true);
    expect(ally.health).toBe(0);
  });

  it("is stripped by no removal of an enchantment, a condition or a hex", () => {
    const sim = match();
    put(sim, "mending-refrain", 15);
    const statuses = get(sim, "a").combatant.statuses;
    statuses.removeByCategory("enchantment");
    statuses.removeByCategory("condition");
    statuses.removeByCategory("hex");
    expect(statuses.has("mending-refrain")).toBe(true);
  });

  it("that runs out in the tick the chant does is gone, and does not renew", () => {
    const sim = match();
    put(sim, "hasty-refrain", 0.2);
    put(sim, CHANT, 0.2);
    stepFor(sim, 0.5);
    expect(remaining(sim, "hasty-refrain")).toBeUndefined();
  });

  it("from two chants ending in one tick fires twice, and renews once", () => {
    const sim = match();
    put(sim, FINALE, 30);
    put(sim, "hasty-refrain", 18);
    stepFor(sim, 2);
    put(sim, CHANT, 0.2);
    put(sim, "make-haste", 0.2);
    const ally = get(sim, "a").combatant;
    ally.health = 100;
    stepFor(sim, 0.5);
    expect(ally.health).toBeGreaterThanOrEqual(100 + 2 * HEAL);
    expect(ally.statuses.get(FINALE)?.triggersLeft).toBe(3);
    expect(remaining(sim, "hasty-refrain")).toBeGreaterThan(17.5);
  });

  it("is not a spell, and is no chant or shout: its own end answers nothing", () => {
    expect(isSpell("echo")).toBe(false);
    const sim = match();
    put(sim, FINALE, 30);
    put(sim, "hasty-refrain", 0.2);
    const ally = get(sim, "a").combatant;
    ally.health = 100;
    stepFor(sim, 0.5);
    expect(ally.health).toBeLessThan(100 + HEAL);
  });

  it("lands on the caster with no ally selected: nothing targeted, or a foe", () => {
    for (const targetId of [undefined, "f"]) {
      const sim = match(["paragon.finale-of-restoration"]);
      if (targetId !== undefined) {
        sim.setTarget("p", targetId);
      }
      expect(sim.requestSkill("p", 0)?.check).toEqual({ ok: true });
      stepFor(sim, 1.5);
      expect(remaining(sim, FINALE, "p")).toBeGreaterThan(29);
      expect(get(sim, "f").combatant.statuses.has(FINALE)).toBe(false);
    }
  });

  it("but a spirit may be targeted by none that says so; a pet or yourself may", () => {
    const caster = { id: "p", team: 0 };
    const target = (id: string, team: number, creatureKind?: "spirit" | "pet") => ({
      id,
      team,
      creatureKind,
      creatureOwnerId: undefined,
    });
    const rule = "single-ally-not-spirit";
    expect(targetRuleAllows(rule, caster, target("s", 0, "spirit"))).toBe("invalid-target-spirit");
    expect(targetRuleAllows(rule, caster, target("w", 0, "pet"))).toBeUndefined();
    expect(targetRuleAllows(rule, caster, target("p", 0))).toBeUndefined();
    expect(targetRuleAllows(rule, caster, target("f", 1))).toBe("invalid-target-enemy");
  });
});

describe("the eight echoes (#1423)", () => {
  it("Aggressive Refrain: you attack 25% faster at -20 armor, renewed", () => {
    const sim = cast("paragon.aggressive-refrain", "p");
    const statuses = get(sim, "p").combatant.statuses;
    expect(statuses.get("aggressive-refrain")?.durationSeconds).toBe(21);
    const modifiers = aggregateModifiers(statuses.active);
    expect(modifiers.attackDurationMultiplier).toBe(0.75);
    // A 1.33 s axe swing becomes 1 s (#1516).
    expect(attackDurationSeconds(get(sim, "p").combatant, 1.33)).toBeCloseTo(1, 2);
    expect(modifiers.armorModifier).toBe(-20);
    expect(getStatusDefinition("aggressive-refrain").renewsOnChantOrShoutEnd).toBe(true);
  });

  it("Blazing Finale: foes adjacent to the ally burn 4 s when a chant ends on it", () => {
    const sim = cast("paragon.blazing-finale");
    expect(remaining(sim, "blazing-finale")).toBeGreaterThan(29);
    chantEnds(sim);
    expect(remaining(sim, "burning", "f")).toBeGreaterThan(3);
    expect(get(sim, "p").combatant.statuses.has("burning")).toBe(false);
  });

  it("Burning Refrain: the ally's hit on a foe with more Health burns it 3 s", () => {
    const sim = cast("paragon.burning-refrain");
    expect(remaining(sim, "burning-refrain")).toBeGreaterThan(19);
    expect(sim.requestAttack("a", "f")?.ok).toBe(true);
    stepFor(sim, 2);
    expect(remaining(sim, "burning", "f")).toBeGreaterThan(1);
    expect(getStatusDefinition("burning-refrain").renewsOnChantOrShoutEnd).toBe(true);
  });

  it("Burning Refrain: no burn on a foe with less Health than the ally", () => {
    const sim = cast("paragon.burning-refrain");
    get(sim, "f").combatant.health = 100;
    expect(sim.requestAttack("a", "f")?.ok).toBe(true);
    stepFor(sim, 2);
    expect(remaining(sim, "burning", "f")).toBeUndefined();
  });

  it("Enduring Harmony: a chant applied after it lasts 50% longer, one before does not", () => {
    const sim = match(["paragon.enduring-harmony"]);
    put(sim, CHANT, 10);
    sim.setTarget("p", "a");
    expect(sim.requestSkill("p", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 1.5);
    expect(remaining(sim, "enduring-harmony")).toBeGreaterThan(29);
    expect(remaining(sim, CHANT)).toBeLessThan(9);
    put(sim, FALL_BACK, 9);
    expect(get(sim, "a").combatant.statuses.get(FALL_BACK)?.durationSeconds).toBeCloseTo(13.5);
  });

  it("Finale of Restoration: the ally is healed 63, the next 5 times only", () => {
    const sim = cast("paragon.finale-of-restoration");
    const ally = get(sim, "a").combatant;
    for (let time = 0; time < 5; time += 1) {
      ally.health = 100;
      chantEnds(sim);
      expect(ally.health).toBeCloseTo(100 + HEAL, 0);
    }
    expect(ally.statuses.has("finale-of-restoration")).toBe(false);
    ally.health = 100;
    chantEnds(sim);
    expect(ally.health).toBeCloseTo(100, 0);
  });

  it("Hasty Refrain: the ally moves 25% faster, renewed; a spirit may wear it", () => {
    const sim = cast("paragon.hasty-refrain");
    expect(remaining(sim, "hasty-refrain")).toBeGreaterThan(17);
    const modifiers = aggregateModifiers(get(sim, "a").combatant.statuses.active);
    expect(modifiers.moveSpeedMultiplier).toBeCloseTo(1.25);
    expect(getSkill("paragon.hasty-refrain")?.target).toBe("single-ally");
  });

  it("Mending Refrain: you have +3 Health regeneration, renewed", () => {
    const sim = cast("paragon.mending-refrain", "p");
    expect(get(sim, "p").combatant.statuses.get("mending-refrain")?.durationSeconds).toBe(15);
    expect(getStatusDefinition("mending-refrain").healthPips).toBe(3);
    expect(getStatusDefinition("mending-refrain").renewsOnChantOrShoutEnd).toBe(true);
  });

  it("Purifying Finale: the ally loses a condition when a chant ends on it", () => {
    const sim = cast("paragon.purifying-finale");
    put(sim, "crippled", 20);
    chantEnds(sim);
    expect(get(sim, "a").combatant.statuses.has("crippled")).toBe(false);
  });
});

describe("Paragon echoes 2 (#1485)", () => {
  it("Bladeturn Refrain: +34 armor against a slashing hit, none against a blunt or piercing one, renewed", () => {
    const sim = cast("paragon.bladeturn-refrain");
    expect(remaining(sim, "bladeturn-refrain")).toBeGreaterThan(19);
    expect(getStatusDefinition("bladeturn-refrain").renewsOnChantOrShoutEnd).toBe(true);
    const ally = get(sim, "a").combatant;
    const armorAgainst = (weapon: Weapon): number =>
      effectiveArmor(ally, skillDamage(10, weapon.damageType, 0), "chest");
    const plain = get(match(), "a").combatant;
    const plainAgainst = (weapon: Weapon): number =>
      effectiveArmor(plain, skillDamage(10, weapon.damageType, 0), "chest");
    for (const weapon of [WEAPONS.sword, WEAPONS.axe, WEAPONS.scythe]) {
      expect(armorAgainst(weapon) - plainAgainst(weapon), weapon.damageType).toBe(34);
    }
    for (const weapon of [WEAPONS.hammer, WEAPONS.spear]) {
      expect(armorAgainst(weapon) - plainAgainst(weapon), weapon.damageType).toBe(0);
    }
    expect(getSkill("paragon.bladeturn-refrain")?.target).toBe("single-ally-not-spirit");
  });

  it("Energizing Finale: the ally, not the Paragon, gains 2 Energy when a chant ends on it", () => {
    const sim = cast("paragon.energizing-finale");
    expect(remaining(sim, "energizing-finale")).toBeGreaterThan(29);
    const paragon = get(sim, "p").combatant;
    const ally = get(sim, "a").combatant;
    ally.energy = 5;
    const paragonEnergy = paragon.energy;
    chantEnds(sim);
    expect(Math.floor(ally.energy)).toBe(7);
    expect(Math.floor(paragon.energy)).toBe(Math.floor(paragonEnergy));
  });

  it("Energizing Finale: an ally at full energy gains nothing over it", () => {
    const sim = cast("paragon.energizing-finale");
    const ally = get(sim, "a").combatant;
    ally.energy = ally.maxEnergy;
    chantEnds(sim);
    expect(ally.energy).toBe(ally.maxEnergy);
  });

  it("Soldier's Fury: -20 armor on its own; a chant adds faster attacks and adrenaline, gone as it ends", () => {
    const sim = cast("paragon.soldiers-fury", "p");
    const statuses = get(sim, "p").combatant.statuses;
    expect(statuses.get("soldiers-fury")?.durationSeconds).toBe(30);
    expect(getSkill("paragon.soldiers-fury")?.elite).toBe(true);
    const alone = aggregateModifiers(statuses.active);
    expect([
      alone.armorModifier,
      alone.attackDurationMultiplier,
      alone.adrenalineGainFaster,
    ]).toEqual([-20, 1, 0]);
    put(sim, CHANT, 0.2, "p");
    const chanted = aggregateModifiers(statuses.active);
    expect(chanted.attackDurationMultiplier).toBe(0.67);
    expect(chanted.adrenalineGainFaster).toBeCloseTo(0.33);
    stepFor(sim, 0.5);
    const after = aggregateModifiers(statuses.active);
    expect([after.attackDurationMultiplier, after.adrenalineGainFaster]).toEqual([1, 0]);
  });
});
