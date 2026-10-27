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
  skillDamage,
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
  return {
    armored: amount,
    armorIgnoring: 0,
    type: "slashing",
    source: "weapon",
    armorPenetration,
  };
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
    const packet = skillDamage(100, "chaos");
    expect(mitigate(packet, defender(60), RULES)).toBe(100);
    expect(mitigate(packet, defender(70), RULES)).toBe(84);
    expect(mitigate(packet, defender(80), RULES)).toBe(71);
  });
});

describe("what armor does and does not stop", () => {
  it("applies to physical, elemental, chaos and dark skill damage", () => {
    for (const type of ["slashing", "fire", "chaos", "dark"] as const) {
      expect(mitigate(skillDamage(100, type), defender(80), RULES), type).toBe(71);
    }
  });

  it("never applies to holy, shadow or typeless skill damage (#760)", () => {
    for (const type of ["holy", "shadow", "typeless"] as const) {
      expect(skillDamage(20, type)).toMatchObject({ armored: 0, armorIgnoring: 20 });
      for (const armor of [0, 60, 100, -50]) {
        expect(
          mitigate(skillDamage(20, type), defender(armor), RULES),
          `${type} at ${String(armor)}`,
        ).toBe(20);
      }
    }
  });

  it("adds the armor-ignoring part after the curve, which still bends the armored part", () => {
    const packet: DamagePacket = { ...physical(40), armorIgnoring: 20 };
    expect(mitigate(physical(40), defender(100), RULES)).toBe(20);
    expect(mitigate(packet, defender(100), RULES)).toBe(40);
    // The −100 floor amplifies only the armored part: 40 × 2^(160/40) + 20.
    expect(mitigate(packet, defender(-300), RULES)).toBe(40 * 16 + 20);
  });

  it("never applies to degeneration or life steal", () => {
    // This is what keeps a condition a genuinely different threat to a
    // heavily-armored target rather than a smaller version of the same
    // one.
    const target = defender(100);
    expect(mitigate(unmitigatedDamage(50, "degeneration"), target, RULES)).toBe(50);
    expect(mitigate(unmitigatedDamage(50, "life-steal"), target, RULES)).toBe(50);
  });

  it("returns nothing for a zero or negative packet", () => {
    expect(mitigate(skillDamage(0, "chaos"), defender(60), RULES)).toBe(0);
    expect(mitigate(skillDamage(-10, "typeless"), defender(60), RULES)).toBe(0);
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
    const packet = skillDamage(100, "chaos");

    expect(mitigate(packet, weakened, RULES)).toBeGreaterThan(mitigate(packet, healthy, RULES));
    // 80 - 20 = 60, the reference level: exactly unmitigated.
    expect(mitigate(packet, weakened, RULES)).toBe(100);
  });

  it("lets Armor of Earth's enchantment actually protect its bearer", () => {
    const warded = defender(60);
    warded.statuses.apply("armor-boost", 30, "self");
    // 60 + 24 = 84.
    expect(mitigate(skillDamage(100, "chaos"), warded, RULES)).toBe(66);
  });

  it("stacks a buff and a debuff additively, as aggregateModifiers does", () => {
    const both = defender(80);
    both.statuses.apply("weakness", 10, "attacker");
    both.statuses.apply("armor-boost", 30, "self");
    // 80 - 20 + 24 = 84.
    expect(effectiveArmor(both, skillDamage(1, "typeless"))).toBe(84);
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

  it("applies Stalwart against a physical hit and not a typeless one", () => {
    const target = withInsignia("stalwart");
    // 80, +20 a Warrior's own vs physical, +10 Stalwart's.
    expect(effectiveArmor(target, physical(10))).toBe(110);
    expect(effectiveArmor(target, { ...physical(10), type: "blunt" })).toBe(110);
    expect(effectiveArmor(target, skillDamage(10, "typeless"))).toBe(80);
  });

  it("applies Blessed only while an enchantment is up", () => {
    const target = withInsignia("blessed");
    expect(effectiveArmor(target, skillDamage(10, "typeless"))).toBe(80);
    target.statuses.apply("armor-boost", 30, "self");
    // +24 from the enchantment itself, +10 because one is active at all.
    expect(effectiveArmor(target, skillDamage(10, "typeless"))).toBe(114);
  });
});

describe("a profession's typed armor (#759)", () => {
  function primary(profession: "warrior" | "ranger" | "monk"): Combatant {
    const resolved = resolveLoadout(
      {
        primaryProfession: profession,
        allocatedRanks: new Map(),
        // No off-hand and no insignias: only the profession's armor.
        equipment: { ...defaultEquipmentFor(profession), offHand: null, armor: bareArmorSet() },
      },
      RULES,
    );
    return makeCombatant({ id: "d", team: 1, equipment: resolved.equipment });
  }

  it("gives a Warrior +20 against physical damage only", () => {
    const warrior = primary("warrior");
    expect(effectiveArmor(warrior, physical(10))).toBe(100);
    expect(effectiveArmor(warrior, skillDamage(10, "fire"))).toBe(80);
    expect(effectiveArmor(warrior, skillDamage(10, "typeless"))).toBe(80);
  });

  it("gives a Ranger +30 against elemental damage only", () => {
    const ranger = primary("ranger");
    expect(effectiveArmor(ranger, physical(10))).toBe(70);
    expect(effectiveArmor(ranger, skillDamage(10, "fire"))).toBe(100);
    expect(effectiveArmor(ranger, skillDamage(10, "cold"))).toBe(100);
    expect(effectiveArmor(ranger, skillDamage(10, "typeless"))).toBe(70);
    expect(effectiveArmor(ranger, skillDamage(10, "chaos"))).toBe(70);
  });

  it("gives a Monk nothing typed", () => {
    const monk = primary("monk");
    expect(effectiveArmor(monk, physical(10))).toBe(60);
    expect(effectiveArmor(monk, skillDamage(10, "fire"))).toBe(60);
  });

  it("lets armor penetration cut through the typed bonus too", () => {
    expect(effectiveArmor(primary("warrior"), physical(10, 0.1))).toBeCloseTo(90, 10);
  });

  it("halves a Fireball on a Ranger: 91 lands for 46", () => {
    expect(mitigate(skillDamage(91, "fire"), primary("ranger"), RULES)).toBe(46);
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
    // A Warrior's 80, +20 vs physical.
    const plain = defender(100);
    const runed = absorbing("superior");
    const before = mitigate(physical(100), plain, RULES);
    expect(mitigate(physical(100), runed, RULES)).toBe(before - 3);
  });

  it("subtracts from the whole of a physical hit, its armor-ignoring part included", () => {
    const packet: DamagePacket = { ...physical(40), armorIgnoring: 16 };
    // 40 at 100 armor is 20, plus 16, minus 3.
    expect(mitigate(packet, absorbing("superior"), RULES)).toBe(33);
  });

  it("does nothing against non-physical damage", () => {
    expect(mitigate(skillDamage(100, "chaos"), absorbing("superior"), RULES)).toBe(
      mitigate(skillDamage(100, "chaos"), defender(80), RULES),
    );
  });

  it("is worth proportionally more against many small hits than one big one", () => {
    // The niche it exists to fill: a flat shield per blow matters to an
    // auto-attack chain and barely registers against a spike.
    const runed = absorbing("superior");
    const plain = defender(100);
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
    const events = applyEffects(
      [{ kind: "damage", amount: { flat: 91 }, type: "typeless" }],
      context(target),
    );
    expect(events).toContainEqual({
      kind: "damage",
      targetId: "defender",
      amount: 91,
      critical: false,
    });
  });

  it("reduces it against an armored target", () => {
    const target = defender(80);
    const events = applyEffects(
      [{ kind: "damage", amount: { flat: 91 }, type: "fire" }],
      context(target),
    );
    expect(events).toContainEqual({
      kind: "damage",
      targetId: "defender",
      amount: 64,
      critical: false,
    });
  });

  it("lands typeless, holy and shadow damage in full against an armored target (#760)", () => {
    for (const type of ["typeless", "holy", "shadow"] as const) {
      const events = applyEffects(
        [{ kind: "damage", amount: { flat: 91 }, type }],
        context(defender(100)),
      );
      expect(events, type).toContainEqual({
        kind: "damage",
        targetId: "defender",
        amount: 91,
        critical: false,
      });
    }
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

describe("the off-hand a resolved loadout holds (#276)", () => {
  const offhandOf = (profession: "warrior" | "elementalist" | "ranger", weaponId?: "hammer") => {
    const equipment = defaultEquipmentFor(profession);
    return resolveLoadout(
      {
        primaryProfession: profession,
        allocatedRanks: new Map(),
        equipment:
          weaponId === undefined
            ? equipment
            : {
                ...equipment,
                mainHand: { weaponId, requirementAttributeId: null },
              },
      },
      RULES,
    ).equipment.offhandId;
  };

  it("names the shield or focus held beside a one-handed weapon", () => {
    expect(offhandOf("warrior")).toBe("shield");
    expect(offhandOf("elementalist")).toBe("focus");
  });

  it("names none for an empty off-hand, or one beside a two-handed weapon", () => {
    expect(offhandOf("ranger")).toBeUndefined();
    // Validation refuses this pairing; a shield that slipped through grants nothing, so it shows nothing.
    expect(offhandOf("warrior", "hammer")).toBeUndefined();
    expect(unarmedResolvedEquipment(60).offhandId).toBeUndefined();
  });
});
