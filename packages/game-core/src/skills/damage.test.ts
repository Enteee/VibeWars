import { describe, expect, it, vi } from "vitest";

import { bareArmorSet, type ArmorSet } from "../equipment/armor.js";
import { defaultEquipmentFor } from "../equipment/loadout.js";
import { NO_UPGRADES } from "../equipment/mods.js";
import { resolveLoadout, unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { InsigniaId } from "../equipment/insignias.js";
import type { EquippedRune } from "../equipment/runes.js";
import { ARMOR_SLOTS, type ArmorSlot, type DamageType } from "../equipment/types.js";
import type { ProfessionId } from "../professions.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { createRng } from "../rng.js";
import {
  armorMultiplier,
  creatureDamageMultiplier,
  effectiveArmor,
  hitLocationOf,
  mitigate,
  skillDamage,
  unmitigatedDamage,
  weaponAttributeMultiplier,
  withSkillArmorPenetration,
  type DamagePacket,
} from "./damage.js";
import { applyEffects } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, SkillContext } from "./types.js";

/** Frenzy at its PvP Strength-12 value, 160% (#1976). */
const STRENGTH_12: ReadonlyMap<string, number> = new Map([["warrior.strength", 12]]);

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
    const packet = skillDamage(100, "chaos", 0);
    expect(mitigate(packet, defender(60), RULES, "chest", createRng(1))).toBe(100);
    expect(mitigate(packet, defender(70), RULES, "chest", createRng(1))).toBe(84);
    expect(mitigate(packet, defender(80), RULES, "chest", createRng(1))).toBe(71);
  });
});

describe("what armor does and does not stop", () => {
  it("applies to physical, elemental, chaos and dark skill damage", () => {
    for (const type of ["slashing", "fire", "chaos", "dark"] as const) {
      expect(
        mitigate(skillDamage(100, type, 0), defender(80), RULES, "chest", createRng(1)),
        type,
      ).toBe(71);
    }
  });

  it("never applies to holy, shadow or typeless skill damage (#760)", () => {
    for (const type of ["holy", "shadow", "typeless"] as const) {
      expect(skillDamage(20, type, 0)).toMatchObject({ armored: 0, armorIgnoring: 20 });
      for (const armor of [0, 60, 100, -50]) {
        expect(
          mitigate(skillDamage(20, type, 0), defender(armor), RULES, "chest", createRng(1)),
          `${type} at ${String(armor)}`,
        ).toBe(20);
      }
    }
  });

  it("adds the armor-ignoring part after the curve, which still bends the armored part", () => {
    const packet: DamagePacket = { ...physical(40), armorIgnoring: 20 };
    expect(mitigate(physical(40), defender(100), RULES, "chest", createRng(1))).toBe(20);
    expect(mitigate(packet, defender(100), RULES, "chest", createRng(1))).toBe(40);
    // The −100 floor amplifies only the armored part: 40 × 2^(160/40) + 20.
    expect(mitigate(packet, defender(-300), RULES, "chest", createRng(1))).toBe(40 * 16 + 20);
  });

  it("never applies to degeneration or life steal", () => {
    // This is what keeps a condition a genuinely different threat to a
    // heavily-armored target rather than a smaller version of the same
    // one.
    const target = defender(100);
    expect(mitigate(unmitigatedDamage(50, "degeneration"), target, RULES, null, createRng(1))).toBe(
      50,
    );
    expect(mitigate(unmitigatedDamage(50, "life-steal"), target, RULES, null, createRng(1))).toBe(
      50,
    );
  });

  it("returns nothing for a zero or negative packet", () => {
    expect(mitigate(skillDamage(0, "chaos", 0), defender(60), RULES, "chest", createRng(1))).toBe(
      0,
    );
    expect(
      mitigate(skillDamage(-10, "typeless", 0), defender(60), RULES, "chest", createRng(1)),
    ).toBe(0);
  });
});

describe("status modifiers reaching the armor calculation", () => {
  it("lets an armor loss make its bearer take more damage", () => {
    // Healing Signet's -40 while it is activated, the one status left
    // that lowers armor (weakness no longer does, #762).
    const exposed = defender(100);
    exposed.statuses.apply("healing-signet-armor", 2, "self", NO_RANKS);

    const healthy = defender(100);
    const packet = skillDamage(100, "chaos", 0);

    expect(mitigate(packet, exposed, RULES, "chest", createRng(1))).toBeGreaterThan(
      mitigate(packet, healthy, RULES, "chest", createRng(1)),
    );
    // 100 - 40 = 60, the reference level: exactly unmitigated.
    expect(mitigate(packet, exposed, RULES, "chest", createRng(1))).toBe(100);
  });

  it("lets Armor of Earth's enchantment actually protect its bearer", () => {
    const warded = defender(60);
    warded.statuses.apply("armor-boost", 30, "self", NO_RANKS);
    // 60 + 24 = 84.
    expect(mitigate(skillDamage(100, "chaos", 0), warded, RULES, "chest", createRng(1))).toBe(66);
  });

  it("stacks a buff and a debuff additively, as aggregateModifiers does", () => {
    const both = defender(80);
    both.statuses.apply("healing-signet-armor", 2, "self", NO_RANKS);
    both.statuses.apply("armor-boost", 30, "self", NO_RANKS);
    // 80 - 40 + 24 = 64.
    expect(effectiveArmor(both, skillDamage(1, "typeless", 0), "chest")).toBe(64);
  });
});

describe("damage taken multipliers (#919)", () => {
  it("takes 160% of a packet against Frenzy and halves it against Dark Escape", () => {
    const packet = skillDamage(100, "chaos", 0);
    const plain = mitigate(packet, defender(60), RULES, "chest", createRng(1));
    const frenzied = defender(60);
    frenzied.statuses.apply("frenzy", 8, "self", STRENGTH_12);
    const escaping = defender(60);
    escaping.statuses.apply("dark-escape", 13, "self", NO_RANKS);

    expect(plain).toBe(100);
    expect(mitigate(packet, frenzied, RULES, "chest", createRng(1))).toBe(160);
    expect(mitigate(packet, escaping, RULES, "chest", createRng(1))).toBe(50);
  });

  it("multiplies the multipliers of statuses that are up together", () => {
    // Two stances never are; the product is still the rule (aggregateModifiers).
    expect(
      aggregateModifiers([
        { id: "frenzy", ranks: STRENGTH_12 },
        { id: "dark-escape", ranks: NO_RANKS },
      ]).damageTakenMultiplier,
    ).toBe(0.8);
  });

  it("multiplies armor-ignoring damage too, and rounds once", () => {
    const escaping = defender(60);
    escaping.statuses.apply("dark-escape", 13, "self", NO_RANKS);
    // (40 + 15) × 0.5 = 27.5: rounded once, at the end.
    const packet: DamagePacket = { ...physical(40), armorIgnoring: 15 };
    expect(mitigate(packet, escaping, RULES, "chest", createRng(1))).toBe(28);
    expect(mitigate(skillDamage(25, "typeless", 0), escaping, RULES, null, createRng(1))).toBe(13);
  });

  it("applies before a Rune of Absorption's flat reduction", () => {
    const resolved = resolveLoadout(
      {
        primaryProfession: "warrior",
        secondaryProfession: undefined,
        allocatedRanks: new Map(),
        equipment: {
          weaponSets: [
            {
              mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
              offHand: null,
            },
            null,
            null,
            null,
          ],
          armor: {
            ...bareArmorSet(),
            feet: {
              insigniaId: null,
              rune: { kind: "universal", runeId: "absorption", tier: "superior" },
            },
          },
        },
      },
      RULES,
    );
    const runed = makeCombatant({ id: "d", team: 1, equipment: resolved.weaponSets[0].equipment });
    const before = mitigate(physical(100), runed, RULES, "chest", createRng(1));
    runed.statuses.apply("frenzy", 8, "self", STRENGTH_12);
    // (x + 3) × 1.6 − 3, not (x − 3) × 1.6.
    expect(mitigate(physical(100), runed, RULES, "chest", createRng(1))).toBe(
      Math.round((before + 3) * 1.6) - 3,
    );
  });
});

describe("damage reduction (#1108)", () => {
  function protectedDefender(): Combatant {
    const target = defender(60);
    target.statuses.apply("call-of-protection", 120, "owner", NO_RANKS);
    return target;
  }

  it("takes 17 off every type of packet: Call of Protection", () => {
    for (const packet of [
      physical(40),
      skillDamage(40, "fire", 0),
      skillDamage(40, "holy", 0),
      skillDamage(40, "typeless", 0),
    ]) {
      expect(mitigate(packet, protectedDefender(), RULES, "chest", createRng(1))).toBe(
        mitigate(packet, defender(60), RULES, "chest", createRng(1)) - 17,
      );
    }
  });

  it("never takes a packet below 0", () => {
    expect(mitigate(physical(10), protectedDefender(), RULES, "chest", createRng(1))).toBe(0);
  });

  it("comes after the damage taken multiplier", () => {
    const target = protectedDefender();
    target.statuses.apply("frenzy", 8, "self", STRENGTH_12);
    // 40 × 1.6 − 17, not (40 − 17) × 1.6.
    expect(mitigate(skillDamage(40, "chaos", 0), target, RULES, "chest", createRng(1))).toBe(47);
  });
});

describe("armor penetration", () => {
  it("scales down whatever armor remains rather than subtracting flat", () => {
    const target = defender(80);
    expect(effectiveArmor(target, physical(10, 0), "chest")).toBe(80);
    expect(effectiveArmor(target, physical(10, 0.1), "chest")).toBeCloseTo(72, 10);
  });

  it("is proportionally worth more the better armored the target is", () => {
    // Penetration removes a *fraction* of armor, so the armor it strips
    // grows with the target's total — and because the curve is
    // exponential, that compounds into a larger relative gain. The
    // absolute gain moves the other way (a soft target lets more damage
    // through to begin with), which is why this asserts the ratio.
    const ratio = (armor: number): number =>
      mitigate(physical(100, 0.1), defender(armor), RULES, "chest", createRng(1)) /
      mitigate(physical(100, 0), defender(armor), RULES, "chest", createRng(1));
    expect(ratio(100)).toBeGreaterThan(ratio(60));
  });

  it("takes a quarter of a typed bonus too: Lightning Orb's 25% (#761)", () => {
    const orb = skillDamage(82, "lightning", 0.25);
    // A Ranger's 70 + 30 vs elemental, a Warrior's 80 vs lightning.
    expect(effectiveArmor(primary("ranger"), orb, "chest")).toBe(75);
    expect(effectiveArmor(primary("warrior"), orb, "chest")).toBe(60);
    expect(mitigate(orb, primary("ranger"), RULES, "chest", createRng(1))).toBe(63);
  });
});

describe("conditional insignia armor, per piece (#1135)", () => {
  function withInsignia(
    insigniaId: "stalwart" | "blessed",
    slots: readonly ArmorSlot[] = ["chest"],
  ): Combatant {
    const piece = (slot: ArmorSlot) => ({
      insigniaId: slots.includes(slot) ? insigniaId : null,
      rune: null,
    });
    const armor: ArmorSet = {
      head: { ...piece("head"), headgearAttributeId: null },
      chest: piece("chest"),
      hands: piece("hands"),
      legs: piece("legs"),
      feet: piece("feet"),
    };
    const resolved = resolveLoadout(
      {
        primaryProfession: "warrior",
        secondaryProfession: undefined,
        allocatedRanks: new Map(),
        equipment: {
          weaponSets: [
            {
              mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
              offHand: null,
            },
            null,
            null,
            null,
          ],
          armor,
        },
      },
      RULES,
    );
    return makeCombatant({ id: "d", team: 1, equipment: resolved.weaponSets[0].equipment });
  }

  it("counts a chest Stalwart on a physical hit to the chest only, never on a typeless one", () => {
    const target = withInsignia("stalwart");
    // 80, +20 a Warrior's own vs physical, +10 Stalwart's on the chest.
    expect(effectiveArmor(target, physical(10), "chest")).toBe(110);
    expect(effectiveArmor(target, { ...physical(10), type: "blunt" }, "chest")).toBe(110);
    expect(effectiveArmor(target, physical(10), "legs")).toBe(100);
    const typeless = skillDamage(10, "typeless", 0);
    expect(hitLocationOf(typeless, createRng(1))).toBeNull();
    expect(effectiveArmor(target, typeless, null)).toBe(80);
  });

  it("draws one float for an armored packet, none for holy, typeless or degeneration", () => {
    const rng = createRng(7);
    const nextFloat = vi.spyOn(rng, "nextFloat");
    for (const packet of [
      skillDamage(10, "holy", 0),
      skillDamage(10, "typeless", 0),
      unmitigatedDamage(5, "degeneration"),
    ]) {
      expect(hitLocationOf(packet, rng)).toBeNull();
    }
    expect(nextFloat).not.toHaveBeenCalled();
    expect(hitLocationOf(physical(10), rng)).not.toBeNull();
    expect(nextFloat).toHaveBeenCalledOnce();
  });

  it("gives five Stalwart +10 on every piece, never +50", () => {
    const target = withInsignia("stalwart", ARMOR_SLOTS);
    for (const slot of ARMOR_SLOTS) {
      expect(effectiveArmor(target, physical(10), slot)).toBe(110);
    }
  });

  it("applies Blessed on its own piece only while an enchantment is up", () => {
    const target = withInsignia("blessed");
    expect(effectiveArmor(target, physical(10), "chest")).toBe(100);
    target.statuses.apply("armor-boost", 30, "self", NO_RANKS);
    // +24 from the enchantment itself, +10 on the chest because one is active at all.
    expect(effectiveArmor(target, physical(10), "chest")).toBe(134);
    expect(effectiveArmor(target, physical(10), "feet")).toBe(124);
  });
});

describe("profession and attacking insignias, per piece (#1142)", () => {
  /** A `profession` primary with `insigniaId` on `slots`, `ranks` allocated, a rune on the chest. */
  function wearing(
    profession: ProfessionId,
    insigniaId: InsigniaId,
    options: {
      readonly slots?: readonly ArmorSlot[];
      readonly ranks?: ReadonlyMap<string, number>;
      readonly chestRune?: EquippedRune;
      readonly skillBar?: readonly (string | null)[];
    } = {},
  ): Combatant {
    const slots = options.slots ?? ["chest"];
    const piece = (slot: ArmorSlot) => ({
      insigniaId: slots.includes(slot) ? insigniaId : null,
      rune: slot === "chest" ? (options.chestRune ?? null) : null,
    });
    const resolved = resolveLoadout(
      {
        primaryProfession: profession,
        secondaryProfession: undefined,
        allocatedRanks: options.ranks ?? new Map(),
        equipment: {
          weaponSets: [
            { ...defaultEquipmentFor(profession).weaponSets[0], offHand: null },
            null,
            null,
            null,
          ],
          armor: {
            head: { ...piece("head"), headgearAttributeId: null },
            chest: piece("chest"),
            hands: piece("hands"),
            legs: piece("legs"),
            feet: piece("feet"),
          },
        },
      },
      RULES,
    );
    return makeCombatant({
      id: "d",
      team: 1,
      attributeRanks: resolved.attributeRanks,
      equipment: resolved.weaponSets[0].equipment,
      skillBar: options.skillBar ?? [],
    });
  }

  const swinging = (target: Combatant): Combatant => {
    target.attack = { targetId: "x", swingElapsed: 0, unreachableSeconds: 0 };
    return target;
  };
  const fire = skillDamage(10, "fire", 0);

  it("gives Brawler's +10 on its piece while attacking, not on the run-up", () => {
    const monk = wearing("monk", "brawlers");
    expect(effectiveArmor(monk, physical(10), "chest")).toBe(60);
    swinging(monk);
    expect(effectiveArmor(monk, physical(10), "chest")).toBe(70);
    expect(effectiveArmor(monk, fire, "chest")).toBe(70);
    expect(effectiveArmor(monk, physical(10), "legs")).toBe(60);
    monk.moving = true;
    expect(effectiveArmor(monk, physical(10), "chest")).toBe(60);
    // Five give +10 a hit, not +50.
    const five = swinging(wearing("monk", "brawlers", { slots: ARMOR_SLOTS }));
    expect(effectiveArmor(five, physical(10), "feet")).toBe(70);
  });

  it("gives Nightstalker's +15 on its piece while attacking", () => {
    const assassin = wearing("assassin", "nightstalkers");
    expect(effectiveArmor(assassin, physical(10), "chest")).toBe(70);
    swinging(assassin);
    expect(effectiveArmor(assassin, physical(10), "chest")).toBe(85);
    expect(effectiveArmor(assassin, physical(10), "legs")).toBe(70);
  });

  it("gives Sentinel's +20 vs elemental from 13 Strength, runes in, weakness out", () => {
    const strength = (rank: number) => new Map([["warrior.strength", rank]]);
    expect(
      effectiveArmor(wearing("warrior", "sentinels", { ranks: strength(12) }), fire, "chest"),
    ).toBe(80);
    const thirteen = wearing("warrior", "sentinels", { ranks: strength(13) });
    expect(effectiveArmor(thirteen, fire, "chest")).toBe(100);
    expect(effectiveArmor(thirteen, fire, "legs")).toBe(80);
    // Physical: the Warrior's own +20 alone.
    expect(effectiveArmor(thirteen, physical(10), "chest")).toBe(100);
    const runed = wearing("warrior", "sentinels", {
      ranks: strength(12),
      chestRune: { kind: "attribute", attributeId: "warrior.strength", tier: "minor" },
    });
    expect(effectiveArmor(runed, fire, "chest")).toBe(100);
    runed.statuses.apply("weakness", 10, "x", NO_RANKS);
    expect(effectiveArmor(runed, fire, "chest")).toBe(80);
  });

  it("gives Prodigy's +5 at 1, 3 and 5 skills recharging", () => {
    const mesmer = wearing("mesmer", "prodigys");
    const armorAt = (recharging: number): number => {
      for (let i = 0; i < recharging; i += 1) {
        mesmer.cast.startRecharge(`skill-${String(i)}`, 10);
      }
      return effectiveArmor(mesmer, physical(10), "chest");
    };
    expect(armorAt(0)).toBe(60);
    expect(armorAt(1)).toBe(65);
    expect(armorAt(2)).toBe(65);
    expect(armorAt(3)).toBe(70);
    expect(armorAt(4)).toBe(70);
    expect(armorAt(5)).toBe(75);
    expect(armorAt(8)).toBe(75);
    expect(effectiveArmor(mesmer, physical(10), "legs")).toBe(60);
  });

  it("gives Windwalker +5 at each of 1 to 4 enchantments", () => {
    const dervish = wearing("dervish", "windwalker");
    const enchantments = [
      "regeneration",
      "mending",
      "holy-veil",
      "healing-breeze",
      "vigorous-spirit",
      "patient-spirit",
    ] as const;
    expect(effectiveArmor(dervish, physical(10), "chest")).toBe(70);
    const seen = enchantments.map((id) => {
      dervish.statuses.apply(id, 30, "x", NO_RANKS);
      return effectiveArmor(dervish, physical(10), "chest");
    });
    expect(seen).toEqual([75, 80, 85, 90, 90, 90]);
    expect(effectiveArmor(dervish, physical(10), "legs")).toBe(70);
  });

  it("cuts 3 off a physical hit to Knight's piece, after armor, and stacks with Absorption", () => {
    // 100 armor vs physical halves a hit: 40 is 20 before the cut.
    const knight = wearing("warrior", "knights");
    expect(mitigate(physical(40), knight, RULES, "chest", createRng(1))).toBe(17);
    expect(mitigate(physical(40), knight, RULES, "legs", createRng(1))).toBe(20);
    expect(mitigate(physical(40), knight, RULES, null, createRng(1))).toBe(20);
    expect(mitigate(skillDamage(40, "fire", 0), knight, RULES, "chest", createRng(1))).toBe(
      mitigate(skillDamage(40, "fire", 0), knight, RULES, "legs", createRng(1)),
    );
    const absorbing = wearing("warrior", "knights", {
      chestRune: { kind: "universal", runeId: "absorption", tier: "superior" },
    });
    expect(mitigate(physical(40), absorbing, RULES, "chest", createRng(1))).toBe(14);
    // Never a heal.
    expect(mitigate(physical(2), knight, RULES, "chest", createRng(1))).toBe(0);
  });

  it("grants another primary's insignia nothing", () => {
    const monk = wearing("monk", "knights");
    expect(monk.equipment.pieceReduction.chest).toBe(0);
    expect(wearing("monk", "nightstalkers").equipment.pieceArmor.chest).toEqual([]);
  });

  it("gives Anchorite's +5 at 1, 3 and 5 skills recharging (#1188)", () => {
    const monk = wearing("monk", "anchorites");
    const armorAt = (recharging: number): number => {
      for (let i = 0; i < recharging; i += 1) {
        monk.cast.startRecharge(`skill-${String(i)}`, 10);
      }
      return effectiveArmor(monk, physical(10), "chest");
    };
    expect([0, 1, 2, 3, 5].map(armorAt)).toEqual([60, 65, 65, 70, 75]);
  });

  it("gives Disciple's +15 while you have a condition, Blighter's +20 while hexed (#1188)", () => {
    const monk = wearing("monk", "disciples");
    expect(effectiveArmor(monk, physical(10), "chest")).toBe(60);
    monk.statuses.apply("malaise", 10, "x", NO_RANKS);
    expect(effectiveArmor(monk, physical(10), "chest")).toBe(60);
    monk.statuses.apply("bleeding", 10, "x", NO_RANKS);
    expect(effectiveArmor(monk, physical(10), "chest")).toBe(75);
    expect(effectiveArmor(monk, physical(10), "legs")).toBe(60);

    const necromancer = wearing("necromancer", "blighters");
    necromancer.statuses.apply("bleeding", 10, "x", NO_RANKS);
    expect(effectiveArmor(necromancer, physical(10), "chest")).toBe(60);
    necromancer.statuses.apply("malaise", 10, "x", NO_RANKS);
    expect(effectiveArmor(necromancer, physical(10), "chest")).toBe(80);
  });

  it("gives Wanderer's and Dreadnought +10 vs elemental only (#1188)", () => {
    const monk = wearing("monk", "wanderers");
    expect(effectiveArmor(monk, fire, "chest")).toBe(70);
    expect(effectiveArmor(monk, physical(10), "chest")).toBe(60);
    const warrior = wearing("warrior", "dreadnought");
    expect(effectiveArmor(warrior, fire, "chest")).toBe(90);
    expect(effectiveArmor(warrior, fire, "legs")).toBe(80);
  });

  it("gives Undertaker's +5 below each of 80, 60, 40 and 20% of the maximum now (#1188)", () => {
    const necromancer = wearing("necromancer", "undertakers");
    const armorAt = (percent: number): number => {
      necromancer.health = (percent / 100) * necromancer.maxHealth;
      return effectiveArmor(necromancer, physical(10), "chest");
    };
    expect([100, 80, 79, 59, 39, 19].map(armorAt)).toEqual([60, 60, 65, 70, 75, 80]);
    // Morale lowers the maximum: 70% of a 500 maximum is below 80%.
    necromancer.maxHealth = 500;
    necromancer.health = 350;
    expect(effectiveArmor(necromancer, physical(10), "chest")).toBe(65);
    // Endure Pain raises it: 350 of 758 is below 60%, as the HUD shows (#1359).
    necromancer.statuses.apply("endure-pain", 16, "self", NO_RANKS);
    expect(effectiveArmor(necromancer, physical(10), "chest")).toBe(70);
  });

  it("gives Minion Master's and Shaman's +5 a tier of what you control (#1188)", () => {
    const necromancer = wearing("necromancer", "minion-masters");
    const minions = (count: number): number => {
      necromancer.controlled.minion = count;
      return effectiveArmor(necromancer, physical(10), "chest");
    };
    expect([0, 1, 2, 3, 5].map(minions)).toEqual([60, 65, 65, 70, 75]);
    necromancer.controlled.minion = 0;
    necromancer.controlled.spirit = 5;
    expect(effectiveArmor(necromancer, physical(10), "chest")).toBe(60);

    const ritualist = wearing("ritualist", "shamans");
    const spirits = (count: number): number => {
      ritualist.controlled.spirit = count;
      return effectiveArmor(ritualist, physical(10), "chest");
    };
    expect([0, 1, 2, 3, 4].map(spirits)).toEqual([60, 65, 70, 75, 75]);
  });

  it("gives Forsaken +10 until the first enchantment (#1188)", () => {
    const dervish = wearing("dervish", "forsaken");
    expect(effectiveArmor(dervish, physical(10), "chest")).toBe(80);
    dervish.statuses.apply("malaise", 10, "x", NO_RANKS);
    expect(effectiveArmor(dervish, physical(10), "chest")).toBe(80);
    dervish.statuses.apply("regeneration", 10, "x", NO_RANKS);
    expect(effectiveArmor(dervish, physical(10), "chest")).toBe(70);
  });

  it("gives Prismatic +5 for each element at 9 or more (#1188)", () => {
    const ranks = (fire: number, water: number, air: number, earth: number) =>
      new Map([
        ["elementalist.fire-magic", fire],
        ["elementalist.water-magic", water],
        ["elementalist.air-magic", air],
        ["elementalist.earth-magic", earth],
      ]);
    const armorWith = (ranked: ReadonlyMap<string, number>): number =>
      effectiveArmor(
        wearing("elementalist", "prismatic", { ranks: ranked }),
        physical(10),
        "chest",
      );
    expect(armorWith(ranks(8, 8, 8, 8))).toBe(60);
    expect(armorWith(ranks(9, 9, 0, 0))).toBe(70);
    expect(armorWith(ranks(9, 9, 9, 9))).toBe(80);
  });

  /** What `target`'s chest insignia adds to a `packet` hit: its chest over its bare legs. */
  const insigniaArmor = (target: Combatant, packet: DamagePacket = physical(10)): number =>
    effectiveArmor(target, packet, "chest") - effectiveArmor(target, packet, "legs");
  const typed = (type: DamageType): DamagePacket =>
    type === "slashing" || type === "piercing" || type === "blunt"
      ? { ...physical(10), type }
      : skillDamage(10, type, 0);

  it("gives Pyromancer +20 vs fire, +10 vs cold, nothing vs piercing (#1206)", () => {
    const elementalist = wearing("elementalist", "pyromancer");
    expect(
      ["fire", "cold", "piercing"].map((type) =>
        insigniaArmor(elementalist, typed(type as DamageType)),
      ),
    ).toEqual([20, 10, 0]);
  });

  it("gives Infiltrator's +20 vs piercing, +10 vs slashing, nothing vs fire (#1206)", () => {
    const assassin = wearing("assassin", "infiltrators");
    expect(
      ["piercing", "slashing", "fire"].map((type) =>
        insigniaArmor(assassin, typed(type as DamageType)),
      ),
    ).toEqual([20, 10, 0]);
  });

  it("gives Bonelace and the -bound ones +15 vs their one type only (#1206)", () => {
    expect(insigniaArmor(wearing("necromancer", "bonelace"), typed("piercing"))).toBe(15);
    expect(insigniaArmor(wearing("necromancer", "bonelace"), typed("slashing"))).toBe(0);
    const ranger = wearing("ranger", "frostbound");
    expect(insigniaArmor(ranger, typed("cold"))).toBe(15);
    expect(insigniaArmor(ranger, typed("fire"))).toBe(0);
  });

  it("gives Sentry's +10 for as long as the stance lasts (#1206)", () => {
    const monk = wearing("monk", "sentrys");
    expect(insigniaArmor(monk)).toBe(0);
    monk.statuses.apply("dash", 1, "d", NO_RANKS);
    expect(insigniaArmor(monk)).toBe(10);
    monk.statuses.remove("dash");
    expect(insigniaArmor(monk)).toBe(0);
  });

  it("gives Scout's +10 under a preparation, Ghost Forge +15 under a weapon spell (#1206)", () => {
    const ranger = wearing("ranger", "scouts");
    ranger.statuses.apply("weapon-of-quickening", 10, "x", NO_RANKS);
    expect(insigniaArmor(ranger)).toBe(0);
    ranger.statuses.apply("apply-poison", 10, "r", NO_RANKS);
    expect(insigniaArmor(ranger)).toBe(10);
    const ritualist = wearing("ritualist", "ghost-forge");
    ritualist.statuses.apply("apply-poison", 10, "x", NO_RANKS);
    expect(insigniaArmor(ritualist)).toBe(0);
    ritualist.statuses.apply("weapon-of-quickening", 10, "x", NO_RANKS);
    expect(insigniaArmor(ritualist)).toBe(15);
  });

  it("gives Centurion's +10 under a shout, and under a chant (#1206)", () => {
    const shouted = wearing("paragon", "centurions");
    expect(insigniaArmor(shouted)).toBe(0);
    shouted.statuses.apply("for-great-justice", 10, "x", NO_RANKS);
    expect(insigniaArmor(shouted)).toBe(10);
    const chanted = wearing("paragon", "centurions");
    chanted.statuses.apply("song-of-restoration", 10, "x", NO_RANKS);
    expect(insigniaArmor(chanted)).toBe(10);
  });

  it("gives Beastmaster's +10 while the pet lives; a minion is no pet (#1206)", () => {
    const ranger = wearing("ranger", "beastmasters");
    ranger.controlled.minion = 3;
    expect(insigniaArmor(ranger)).toBe(0);
    ranger.controlled.pet = 1;
    expect(insigniaArmor(ranger)).toBe(10);
  });

  it("gives Virtuoso's and Mystic's +15 while activating any skill, not on a plain swing (#1206)", () => {
    const mesmer = wearing("mesmer", "virtuosos");
    swinging(mesmer);
    expect(insigniaArmor(mesmer)).toBe(0);
    mesmer.cast.beginCast("warrior.swift-chop", "x", 1, undefined);
    expect(insigniaArmor(mesmer)).toBe(15);
    const ritualist = wearing("ritualist", "mystics");
    ritualist.cast.beginCast("ritualist.spirit-light", "x", 1, undefined);
    expect(insigniaArmor(ritualist)).toBe(15);
  });

  it("gives Artificer's +3 a signet on the bar: 0, 2 and 8 give 0, 6 and 24 (#1206)", () => {
    const signets = (count: number): number =>
      insigniaArmor(
        wearing("mesmer", "artificers", {
          skillBar: Array.from({ length: 8 }, (_, slot) =>
            slot < count ? "mesmer.leech-signet" : "mesmer.power-drain",
          ),
        }),
      );
    expect([0, 2, 8].map(signets)).toEqual([0, 6, 24]);
  });
});

describe("Mysticism's armor while enchanted (#874)", () => {
  function dervish(rank: number): Combatant {
    return defender(80, { attributeRanks: new Map([["dervish.mysticism", rank]]) });
  }

  it("adds +1 a rank while any enchantment is up, and nothing without one", () => {
    const target = dervish(12);
    expect(effectiveArmor(target, physical(10), "chest")).toBe(80);
    // Armor of Earth's own +24, then Mysticism's +12.
    target.statuses.apply("armor-boost", 30, "someone-else", NO_RANKS);
    expect(effectiveArmor(target, physical(10), "chest")).toBe(116);
    expect(mitigate(physical(100), target, RULES, "chest", createRng(1))).toBeLessThan(
      mitigate(physical(100), dervish(12), RULES, "chest", createRng(1)),
    );
  });

  it("adds nothing at rank 0", () => {
    const target = dervish(0);
    target.statuses.apply("armor-boost", 30, "self", NO_RANKS);
    expect(effectiveArmor(target, physical(10), "chest")).toBe(104);
  });
});

/** A bare-armored combatant of `profession`: only its own typed armor. */
function primary(profession: "warrior" | "ranger" | "monk"): Combatant {
  const resolved = resolveLoadout(
    {
      primaryProfession: profession,
      secondaryProfession: undefined,
      allocatedRanks: new Map(),
      // No off-hand and no insignias: only the profession's armor.
      equipment: {
        weaponSets: [
          { ...defaultEquipmentFor(profession).weaponSets[0], offHand: null },
          null,
          null,
          null,
        ],
        armor: bareArmorSet(),
      },
    },
    RULES,
  );
  return makeCombatant({ id: "d", team: 1, equipment: resolved.weaponSets[0].equipment });
}

describe("a profession's typed armor (#759)", () => {
  it("gives a Warrior +20 against physical damage only", () => {
    const warrior = primary("warrior");
    expect(effectiveArmor(warrior, physical(10), "chest")).toBe(100);
    expect(effectiveArmor(warrior, skillDamage(10, "fire", 0), "chest")).toBe(80);
    expect(effectiveArmor(warrior, skillDamage(10, "typeless", 0), "chest")).toBe(80);
  });

  it("gives a Ranger +30 against elemental damage only", () => {
    const ranger = primary("ranger");
    expect(effectiveArmor(ranger, physical(10), "chest")).toBe(70);
    expect(effectiveArmor(ranger, skillDamage(10, "fire", 0), "chest")).toBe(100);
    expect(effectiveArmor(ranger, skillDamage(10, "cold", 0), "chest")).toBe(100);
    expect(effectiveArmor(ranger, skillDamage(10, "typeless", 0), "chest")).toBe(70);
    expect(effectiveArmor(ranger, skillDamage(10, "chaos", 0), "chest")).toBe(70);
  });

  it("gives a Monk nothing typed", () => {
    const monk = primary("monk");
    expect(effectiveArmor(monk, physical(10), "chest")).toBe(60);
    expect(effectiveArmor(monk, skillDamage(10, "fire", 0), "chest")).toBe(60);
  });

  it("lets armor penetration cut through the typed bonus too", () => {
    expect(effectiveArmor(primary("warrior"), physical(10, 0.1), "chest")).toBeCloseTo(90, 10);
  });

  it("halves a Fireball on a Ranger: 91 lands for 46", () => {
    expect(
      mitigate(skillDamage(91, "fire", 0), primary("ranger"), RULES, "chest", createRng(1)),
    ).toBe(46);
  });
});

describe("a status's typed armor (#1437)", () => {
  it("gives Avatar of Melandru's +30 against elemental damage only", () => {
    const avatar = primary("monk");
    avatar.statuses.apply("avatar-of-melandru", 74, "self", NO_RANKS);
    expect(effectiveArmor(avatar, skillDamage(10, "fire", 0), "chest")).toBe(90);
    expect(effectiveArmor(avatar, skillDamage(10, "earth", 0), "chest")).toBe(90);
    expect(effectiveArmor(avatar, physical(10), "chest")).toBe(60);
    expect(effectiveArmor(avatar, skillDamage(10, "chaos", 0), "chest")).toBe(60);
  });
});

describe("Cracked Armor (#763)", () => {
  function cracked(armor: number): Combatant {
    const target = defender(armor);
    target.statuses.apply("cracked-armor", 17, "attacker", NO_RANKS);
    return target;
  }

  it("takes 20 armor, but never below 60", () => {
    const at = (armor: number): number =>
      effectiveArmor(cracked(armor), skillDamage(1, "typeless", 0), "chest");
    expect(at(100)).toBe(80);
    expect(at(80)).toBe(60);
    expect(at(70)).toBe(60);
    expect(at(60)).toBe(60);
    expect(at(50)).toBe(50);
  });

  it("is taken before Armor of Earth adds: a cracked 60 caster still reaches 84", () => {
    const warded = cracked(60);
    warded.statuses.apply("armor-boost", 30, "self", NO_RANKS);
    expect(effectiveArmor(warded, skillDamage(1, "typeless", 0), "chest")).toBe(84);
  });

  it("counts a typed bonus as armor it can take", () => {
    const ranger = primary("ranger");
    ranger.statuses.apply("cracked-armor", 17, "attacker", NO_RANKS);
    expect(effectiveArmor(ranger, skillDamage(10, "fire", 0), "chest")).toBe(80);
    expect(effectiveArmor(ranger, physical(10), "chest")).toBe(60);
    const warrior = primary("warrior");
    warrior.statuses.apply("cracked-armor", 17, "attacker", NO_RANKS);
    expect(effectiveArmor(warrior, physical(10), "chest")).toBe(80);
  });

  it("is taken before armor penetration: 25% of a cracked Warrior's 60 leaves 45", () => {
    const warrior = primary("warrior");
    warrior.statuses.apply("cracked-armor", 17, "attacker", NO_RANKS);
    expect(effectiveArmor(warrior, skillDamage(10, "lightning", 0.25), "chest")).toBe(45);
  });

  it("makes a sword hit a cracked Warrior about 41% harder", () => {
    const warrior = primary("warrior");
    const healthy = mitigate(physical(100), warrior, RULES, "chest", createRng(1));
    warrior.statuses.apply("cracked-armor", 17, "attacker", NO_RANKS);
    expect(mitigate(physical(100), warrior, RULES, "chest", createRng(1)) / healthy).toBeCloseTo(
      1.41,
      1,
    );
  });
});

describe("Rune of Absorption", () => {
  function absorbing(tier: "minor" | "superior"): Combatant {
    const resolved = resolveLoadout(
      {
        primaryProfession: "warrior",
        secondaryProfession: undefined,
        allocatedRanks: new Map(),
        equipment: {
          weaponSets: [
            {
              mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
              offHand: null,
            },
            null,
            null,
            null,
          ],
          armor: {
            ...bareArmorSet(),
            feet: { insigniaId: null, rune: { kind: "universal", runeId: "absorption", tier } },
          },
        },
      },
      RULES,
    );
    return makeCombatant({ id: "d", team: 1, equipment: resolved.weaponSets[0].equipment });
  }

  it("subtracts a flat amount from a physical hit, after mitigation", () => {
    // A Warrior's 80, +20 vs physical.
    const plain = defender(100);
    const runed = absorbing("superior");
    const before = mitigate(physical(100), plain, RULES, "chest", createRng(1));
    expect(mitigate(physical(100), runed, RULES, "chest", createRng(1))).toBe(before - 3);
  });

  it("subtracts from the whole of a physical hit, its armor-ignoring part included", () => {
    const packet: DamagePacket = { ...physical(40), armorIgnoring: 16 };
    // 40 at 100 armor is 20, plus 16, minus 3.
    expect(mitigate(packet, absorbing("superior"), RULES, "chest", createRng(1))).toBe(33);
  });

  it("does nothing against non-physical damage", () => {
    expect(
      mitigate(skillDamage(100, "chaos", 0), absorbing("superior"), RULES, "chest", createRng(1)),
    ).toBe(mitigate(skillDamage(100, "chaos", 0), defender(80), RULES, "chest", createRng(1)));
  });

  it("is worth proportionally more against many small hits than one big one", () => {
    // The niche it exists to fill: a flat shield per blow matters to an
    // auto-attack chain and barely registers against a spike.
    const runed = absorbing("superior");
    const plain = defender(100);
    const lossFraction = (amount: number): number => {
      const base = mitigate(physical(amount), plain, RULES, "chest", createRng(1));
      return (base - mitigate(physical(amount), runed, RULES, "chest", createRng(1))) / base;
    };
    expect(lossFraction(10)).toBeGreaterThan(lossFraction(100));
  });

  it("never drives a hit below zero", () => {
    expect(mitigate(physical(1), absorbing("superior"), RULES, "chest", createRng(1))).toBe(0);
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

describe("the creature damage multiplier (#1131)", () => {
  const level = (atZero: number, atTwelve: number) => ({ atZero, atTwelve });

  it("is 1 at rank 12, 0 at rank 0 for a level-0 creature, and (5/10)^1.5 at 6", () => {
    expect(creatureDamageMultiplier(12, level(0, 10))).toBe(1);
    expect(creatureDamageMultiplier(0, level(0, 10))).toBe(0);
    expect(creatureDamageMultiplier(6, level(0, 10))).toBeCloseTo(Math.pow(5 / 10, 1.5), 10);
  });

  it("keeps rising past 12, on the same line of levels", () => {
    // A Bone Horror at Death Magic 16 is level 1 + 13 × 16/12.
    expect(creatureDamageMultiplier(16, level(1, 14))).toBeCloseTo(
      Math.pow((1 + (13 * 16) / 12) / 14, 1.5),
      10,
    );
  });
});

describe("spell damage through the effect system", () => {
  function context(target: Combatant): SkillContext {
    return {
      caster: makeCombatant({ id: "caster", attributeRanks: new Map([["x", 12]]) }),
      target,
      rng: createRng(1),
      rules: RULES,
      surroundings: new Map(),
    };
  }

  it("leaves a skill's stated damage untouched against a reference-armor target", () => {
    // The regression guard for the whole phase: nothing about the
    // existing catalog changes against the targets it was tuned on.
    const target = defender(RULES.armorReferenceLevel);
    const events = applyEffects(
      [{ kind: "damage", amount: { flat: 91 }, type: "typeless", armorPenetration: 0 }],
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
      [{ kind: "damage", amount: { flat: 91 }, type: "fire", armorPenetration: 0 }],
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
        [{ kind: "damage", amount: { flat: 91 }, type, armorPenetration: 0 }],
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
      surroundings: new Map(),
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
          secondaryProfession: undefined,
          allocatedRanks: new Map(),
          equipment: {
            ...defaultEquipmentFor(profession),
            weaponSets: [
              { ...defaultEquipmentFor(profession).weaponSets[0], offHand: null },
              null,
              null,
              null,
            ],
          },
        },
        RULES,
      ).weaponSets[0].equipment.baseArmor;

    expect(armorFor("warrior")).toBe(80);
    expect(armorFor("ranger")).toBe(70);
    expect(armorFor("monk")).toBe(60);
  });

  it("gives a shield only half its armor until the requirement is met", () => {
    const withRank = (rank: number): number =>
      resolveLoadout(
        {
          primaryProfession: "warrior",
          secondaryProfession: undefined,
          allocatedRanks: new Map([["warrior.strength", rank]]),
          equipment: {
            weaponSets: [
              {
                mainHand: {
                  weaponId: "sword",
                  requirementAttributeId: null,
                  upgrades: NO_UPGRADES,
                },
                offHand: {
                  offhandId: "shield",
                  requirementAttributeId: "warrior.strength",
                  upgrades: NO_UPGRADES,
                },
              },
              null,
              null,
              null,
            ],
            armor: bareArmorSet(),
          },
        },
        RULES,
      ).weaponSets[0].equipment.baseArmor;

    expect(withRank(0)).toBe(88);
    expect(withRank(9)).toBe(96);
  });

  it("grants no shield armor at all alongside a two-handed weapon", () => {
    // Validation rejects this build; the resolver still must not hand out
    // free armor if one reaches it from an older client.
    const resolved = resolveLoadout(
      {
        primaryProfession: "warrior",
        secondaryProfession: undefined,
        allocatedRanks: new Map([["warrior.strength", 12]]),
        equipment: {
          weaponSets: [
            {
              mainHand: { weaponId: "hammer", requirementAttributeId: null, upgrades: NO_UPGRADES },
              offHand: {
                offhandId: "shield",
                requirementAttributeId: "warrior.strength",
                upgrades: NO_UPGRADES,
              },
            },
            null,
            null,
            null,
          ],
          armor: bareArmorSet(),
        },
      },
      RULES,
    );
    expect(resolved.weaponSets[0].equipment.baseArmor).toBe(80);
  });
});

describe("the off-hand a resolved loadout holds (#276)", () => {
  const offhandOf = (profession: "warrior" | "elementalist" | "ranger", weaponId?: "hammer") => {
    const equipment = defaultEquipmentFor(profession);
    return resolveLoadout(
      {
        primaryProfession: profession,
        secondaryProfession: undefined,
        allocatedRanks: new Map(),
        equipment:
          weaponId === undefined
            ? equipment
            : {
                ...equipment,
                weaponSets: [
                  {
                    ...equipment.weaponSets[0],
                    mainHand: { weaponId, requirementAttributeId: null, upgrades: NO_UPGRADES },
                  },
                  null,
                  null,
                  null,
                ],
              },
      },
      RULES,
    ).weaponSets[0].equipment.offhandId;
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

describe("skill armor penetration from statuses (#1464)", () => {
  it("adds to a skill of its profession, at most 1 in all", () => {
    const caster = makeCombatant({ id: "r" });
    caster.statuses.apply("cruel-was-daoshen", 51, "r", NO_RANKS);
    expect(withSkillArmorPenetration(0.25, caster, "ritualist")).toBeCloseTo(0.35);
    expect(withSkillArmorPenetration(0.95, caster, "ritualist")).toBe(1);
  });

  it("adds nothing to another profession's skill, or to a weapon blow, which is no skill's", () => {
    const caster = makeCombatant({ id: "r" });
    caster.statuses.apply("cruel-was-daoshen", 51, "r", NO_RANKS);
    expect(withSkillArmorPenetration(0.25, caster, "elementalist")).toBe(0.25);
    expect(withSkillArmorPenetration(0, caster, undefined)).toBe(0);
  });
});
