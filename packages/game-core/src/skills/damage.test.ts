import { describe, expect, it } from "vitest";

import { bareArmorSet } from "../equipment/armor.js";
import { defaultEquipmentFor } from "../equipment/loadout.js";
import { resolveLoadout, unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { createRng } from "../rng.js";
import {
  armorMultiplier,
  effectiveArmor,
  mitigate,
  respectsArmor,
  spellDamage,
  unmitigatedDamage,
  weaponAttributeMultiplier,
  type DamagePacket,
} from "./damage.js";
import { applyEffects } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, SkillContext } from "./types.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;

function defender(armor: number, overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({
    id: "defender",
    team: 1,
    equipment: unarmedResolvedEquipment(armor),
    ...overrides,
  });
}

function physical(amount: number, armorPenetration = 0): DamagePacket {
  return { amount, type: "slashing", source: "weapon", armorPenetration };
}

describe("the armor curve", () => {
  it("is exactly 1.0 at the reference level", () => {
    // The single most important number in this module. Every skill in
    // the catalog was tuned with no armor at all; anchoring the curve at
    // the caster professions' base armor is what keeps all twelve of
    // them dealing precisely what they dealt before, against the targets
    // they were balanced on.
    expect(armorMultiplier(RULES.armorReferenceLevel, RULES)).toBe(1);
  });

  it("halves damage for each halving-interval of armor above the reference", () => {
    const { armorReferenceLevel: ref, armorHalvingPoints: step } = RULES;
    expect(armorMultiplier(ref + step, RULES)).toBeCloseTo(0.5, 10);
    expect(armorMultiplier(ref + 2 * step, RULES)).toBeCloseTo(0.25, 10);
  });

  it("doubles damage for each halving-interval below it", () => {
    const { armorReferenceLevel: ref, armorHalvingPoints: step } = RULES;
    expect(armorMultiplier(ref - step, RULES)).toBeCloseTo(2, 10);
  });

  it.each([
    [60, 1.0],
    [70, 0.8409],
    [80, 0.7071],
    [88, 0.6156],
    [100, 0.5],
  ])("mitigates to %sx at armor %i", (armor, expected) => {
    expect(armorMultiplier(armor, RULES)).toBeCloseTo(expected, 4);
  });

  it("makes a warrior measurably tougher than a caster against the same hit", () => {
    const packet = spellDamage(100);
    expect(mitigate(packet, defender(60), RULES)).toBe(100);
    expect(mitigate(packet, defender(70), RULES)).toBe(84);
    expect(mitigate(packet, defender(80), RULES)).toBe(71);
  });
});

describe("what armor does and does not stop", () => {
  it("applies to weapons and spells", () => {
    expect(respectsArmor("weapon")).toBe(true);
    expect(respectsArmor("spell")).toBe(true);
  });

  it("never applies to degeneration or life steal", () => {
    // This is what keeps a condition a genuinely different threat to a
    // heavily-armored target rather than a smaller version of the same
    // one.
    expect(respectsArmor("degeneration")).toBe(false);
    expect(respectsArmor("life-steal")).toBe(false);

    const target = defender(100);
    expect(mitigate(unmitigatedDamage(50, "degeneration"), target, RULES)).toBe(50);
    expect(mitigate(unmitigatedDamage(50, "life-steal"), target, RULES)).toBe(50);
  });

  it("returns nothing for a zero or negative packet", () => {
    expect(mitigate(spellDamage(0), defender(60), RULES)).toBe(0);
    expect(mitigate(spellDamage(-10), defender(60), RULES)).toBe(0);
  });
});

describe("status modifiers reaching the armor calculation", () => {
  it("lets Weakness make its bearer take more damage", () => {
    // `armorModifier` has existed on StatusDefinition since conditions
    // shipped and nothing read it. Weakness's tooltip promised -20 armor
    // and delivered nothing; this is the test that it now does.
    const weakened = defender(80);
    weakened.statuses.apply("weakness", 10, "attacker");

    const healthy = defender(80);
    const packet = spellDamage(100);

    expect(mitigate(packet, weakened, RULES)).toBeGreaterThan(mitigate(packet, healthy, RULES));
    // 80 - 20 = 60, the reference level: exactly unmitigated.
    expect(mitigate(packet, weakened, RULES)).toBe(100);
  });

  it("lets Armor of Earth's enchantment actually protect its bearer", () => {
    const warded = defender(60);
    warded.statuses.apply("armor-boost", 30, "self");
    // 60 + 24 = 84.
    expect(mitigate(spellDamage(100), warded, RULES)).toBe(66);
  });

  it("stacks a buff and a debuff additively, as aggregateModifiers does", () => {
    const both = defender(80);
    both.statuses.apply("weakness", 10, "attacker");
    both.statuses.apply("armor-boost", 30, "self");
    // 80 - 20 + 24 = 84.
    expect(effectiveArmor(both, spellDamage(1))).toBe(84);
  });
});

describe("armor penetration", () => {
  it("scales down whatever armor remains rather than subtracting flat", () => {
    const target = defender(80);
    expect(effectiveArmor(target, physical(10, 0))).toBe(80);
    expect(effectiveArmor(target, physical(10, 0.1))).toBeCloseTo(72, 10);
  });

  it("is proportionally worth more the better armored the target is", () => {
    // Penetration removes a *fraction* of armor, so the armor it strips
    // grows with the target's total — and because the curve is
    // exponential, that compounds into a larger relative gain. The
    // absolute gain moves the other way (a soft target lets more damage
    // through to begin with), which is why this asserts the ratio.
    const ratio = (armor: number): number =>
      mitigate(physical(100, 0.1), defender(armor), RULES) /
      mitigate(physical(100, 0), defender(armor), RULES);
    expect(ratio(100)).toBeGreaterThan(ratio(60));
  });
});

describe("conditional insignia armor", () => {
  function withInsignia(insigniaId: "stalwart" | "blessed"): Combatant {
    const resolved = resolveLoadout(
      {
        primaryProfession: "warrior",
        allocatedRanks: new Map(),
        equipment: {
          mainHand: { weaponId: "sword", requirementAttributeId: null },
          offHand: null,
          armor: { ...bareArmorSet(), chest: { insigniaId, rune: null } },
        },
      },
      RULES,
    );
    return makeCombatant({ id: "d", team: 1, equipment: resolved.equipment });
  }

  it("applies Stalwart against a physical hit and not an untyped one", () => {
    const target = withInsignia("stalwart");
    expect(effectiveArmor(target, physical(10))).toBe(90);
    expect(effectiveArmor(target, spellDamage(10))).toBe(80);
  });

  it("applies Blessed only while an enchantment is up", () => {
    const target = withInsignia("blessed");
    expect(effectiveArmor(target, spellDamage(10))).toBe(80);
    target.statuses.apply("armor-boost", 30, "self");
    // +24 from the enchantment itself, +10 because one is active at all.
    expect(effectiveArmor(target, spellDamage(10))).toBe(114);
  });
});

describe("Rune of Absorption", () => {
  function absorbing(tier: "minor" | "superior"): Combatant {
    const resolved = resolveLoadout(
      {
        primaryProfession: "warrior",
        allocatedRanks: new Map(),
        equipment: {
          mainHand: { weaponId: "sword", requirementAttributeId: null },
          offHand: null,
          armor: {
            ...bareArmorSet(),
            feet: { insigniaId: null, rune: { kind: "universal", runeId: "absorption", tier } },
          },
        },
      },
      RULES,
    );
    return makeCombatant({ id: "d", team: 1, equipment: resolved.equipment });
  }

  it("subtracts a flat amount from a physical hit, after mitigation", () => {
    const plain = defender(80);
    const runed = absorbing("superior");
    const before = mitigate(physical(100), plain, RULES);
    expect(mitigate(physical(100), runed, RULES)).toBe(before - 3);
  });

  it("does nothing against untyped damage", () => {
    expect(mitigate(spellDamage(100), absorbing("superior"), RULES)).toBe(
      mitigate(spellDamage(100), defender(80), RULES),
    );
  });

  it("is worth proportionally more against many small hits than one big one", () => {
    // The niche it exists to fill: a flat shield per blow matters to an
    // auto-attack chain and barely registers against a spike.
    const runed = absorbing("superior");
    const plain = defender(80);
    const lossFraction = (amount: number): number => {
      const base = mitigate(physical(amount), plain, RULES);
      return (base - mitigate(physical(amount), runed, RULES)) / base;
    };
    expect(lossFraction(10)).toBeGreaterThan(lossFraction(100));
  });

  it("never drives a hit below zero", () => {
    expect(mitigate(physical(1), absorbing("superior"), RULES)).toBe(0);
  });
});

describe("the weapon attribute multiplier", () => {
  it.each([
    [0, 0.3536],
    [9, 0.771],
    [12, 1.0],
    [15, 1.1092],
  ])("is %sx at rank %i", (rank, expected) => {
    expect(weaponAttributeMultiplier(rank, RULES)).toBeCloseTo(expected, 3);
  });

  it("is exactly 1.0 at the pivot, so catalog damage reads literally", () => {
    expect(weaponAttributeMultiplier(RULES.damageRankPivot, RULES)).toBe(1);
  });

  it("rises more slowly above the pivot than below it", () => {
    // Runes should be a bonus, not a second doubling.
    const belowStep = weaponAttributeMultiplier(12, RULES) - weaponAttributeMultiplier(11, RULES);
    const aboveStep = weaponAttributeMultiplier(13, RULES) - weaponAttributeMultiplier(12, RULES);
    expect(aboveStep).toBeLessThan(belowStep);
  });

  it("treats a negative rank as zero rather than inverting the curve", () => {
    expect(weaponAttributeMultiplier(-5, RULES)).toBe(weaponAttributeMultiplier(0, RULES));
  });
});

describe("spell damage through the effect system", () => {
  function context(target: Combatant): SkillContext {
    return {
      caster: makeCombatant({ id: "caster", attributeRanks: new Map([["x", 12]]) }),
      target,
      rng: createRng(1),
      rules: RULES,
    };
  }

  it("leaves a skill's stated damage untouched against a reference-armor target", () => {
    // The regression guard for the whole phase: nothing about the
    // existing catalog changes against the targets it was tuned on.
    const target = defender(RULES.armorReferenceLevel);
    const events = applyEffects([{ kind: "damage", amount: { flat: 91 } }], context(target));
    expect(events).toContainEqual({ kind: "damage", targetId: "defender", amount: 91 });
  });

  it("reduces it against an armored target", () => {
    const target = defender(80);
    const events = applyEffects([{ kind: "damage", amount: { flat: 91 } }], context(target));
    expect(events).toContainEqual({ kind: "damage", targetId: "defender", amount: 64 });
  });

  it("does not let armor save a target from their own sacrifice", () => {
    // `sacrifice-health` goes straight to `applyDamage`, bypassing
    // mitigation, because paying a cost is not being attacked.
    const caster = makeCombatant({
      id: "caster",
      equipment: unarmedResolvedEquipment(100),
    });
    const events = applyEffects([{ kind: "sacrifice-health", percentOfMax: 10 }], {
      caster,
      target: undefined,
      rng: createRng(1),
      rules: RULES,
    });
    expect(events).toContainEqual({ kind: "sacrifice", targetId: "caster", amount: 50 });
  });
});

describe("resolved loadouts feeding the pipeline", () => {
  it("gives every profession the base armor its archetype implies", () => {
    const armorFor = (profession: "warrior" | "ranger" | "monk"): number =>
      resolveLoadout(
        {
          primaryProfession: profession,
          allocatedRanks: new Map(),
          equipment: { ...defaultEquipmentFor(profession), offHand: null },
        },
        RULES,
      ).equipment.baseArmor;

    expect(armorFor("warrior")).toBe(80);
    expect(armorFor("ranger")).toBe(70);
    expect(armorFor("monk")).toBe(60);
  });

  it("gives a shield only half its armor until the requirement is met", () => {
    const withRank = (rank: number): number =>
      resolveLoadout(
        {
          primaryProfession: "warrior",
          allocatedRanks: new Map([["warrior.strength", rank]]),
          equipment: {
            mainHand: { weaponId: "sword", requirementAttributeId: null },
            offHand: { offhandId: "shield", requirementAttributeId: "warrior.strength" },
            armor: bareArmorSet(),
          },
        },
        RULES,
      ).equipment.baseArmor;

    expect(withRank(0)).toBe(88);
    expect(withRank(9)).toBe(96);
  });

  it("grants no shield armor at all alongside a two-handed weapon", () => {
    // Validation rejects this build; the resolver still must not hand out
    // free armor if one reaches it from an older client.
    const resolved = resolveLoadout(
      {
        primaryProfession: "warrior",
        allocatedRanks: new Map([["warrior.strength", 12]]),
        equipment: {
          mainHand: { weaponId: "hammer", requirementAttributeId: null },
          offHand: { offhandId: "shield", requirementAttributeId: "warrior.strength" },
          armor: bareArmorSet(),
        },
      },
      RULES,
    );
    expect(resolved.equipment.baseArmor).toBe(80);
  });
});
