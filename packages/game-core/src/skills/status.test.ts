import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { getSkill } from "./catalog.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import {
  NO_RANKS,
  MAX_PIPS,
  STATUS_DEFINITIONS,
  StatusSet,
  aggregateModifiers,
  clampPips,
  getStatusDefinition,
  ownSkillBoost,
  type StatusId,
} from "./status.js";
import { statAtTwelve } from "./scaling.js";
import { makeCombatant, withAttackDuration } from "./testing.js";
import { attackDamageDeltaOf } from "./tick.js";
import type { FiredTrigger } from "./triggers.js";
import { attackBlockedRiders } from "./weapon-attack.js";

const ALL_STATUS_IDS = Object.keys(STATUS_DEFINITIONS) as StatusId[];

describe("status definitions", () => {
  it("defines all eight conditions the brief names", () => {
    for (const id of [
      "bleeding",
      "burning",
      "poison",
      "crippled",
      "blind",
      "weakness",
      "deep-wound",
      "dazed",
    ] as const) {
      expect(getStatusDefinition(id).category).toBe("condition");
    }
  });

  it("gives every status a self-consistent id and a non-empty name", () => {
    for (const id of ALL_STATUS_IDS) {
      const def = getStatusDefinition(id);
      expect(def.id).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
    }
  });

  it("gives every status at least one actual mechanical effect", () => {
    for (const id of ALL_STATUS_IDS) {
      const def = getStatusDefinition(id);
      const hasEffect =
        def.healthPips !== 0 ||
        def.healthPipsPerEnchantment !== undefined ||
        def.preventsKnockdown ||
        def.preventsSpells ||
        def.preventsBlocking ||
        def.unblockableBySource ||
        def.unblockableAttacks !== undefined ||
        def.attacksUnblockable ||
        def.energyPips !== 0 ||
        def.armorModifier !== 0 ||
        def.armorWhileStill !== 0 ||
        def.healthPerSecondWhileMoving !== 0 ||
        def.healthPerSecond !== 0 ||
        def.healthPerSecondNearSpirit !== 0 ||
        def.armorReduction !== undefined ||
        def.moveSpeedMultiplier !== 1 ||
        def.attackMissChance !== 0 ||
        def.maxHealthLoss !== undefined ||
        def.maxHealthBonus !== 0 ||
        def.maxHealthBonusPerEnchantment !== 0 ||
        def.healingMultiplier !== 1 ||
        def.weaponDamageMultiplier !== 1 ||
        def.physicalDamageTakenBonus !== 0 ||
        def.attributeDeltas.length > 0 ||
        def.attributeSet !== undefined ||
        def.borrowsAttribute !== undefined ||
        def.castTimeMultiplier !== 1 ||
        def.interruptsSpells ||
        def.untargetableByFoeSpells ||
        def.preventsEnchantments ||
        def.preventsShoutsAndChants ||
        def.attackDurationMultiplier !== 1 ||
        def.projectileSpeedMultiplier !== 1 ||
        def.block !== undefined ||
        def.maxDamageFractionPerHit !== undefined ||
        def.attackDamageCapFraction !== undefined ||
        def.lifeStealReduction !== 0 ||
        def.knockdownMinSeconds !== undefined ||
        def.reversesNextDamage !== undefined ||
        def.reflectsAttackDamage !== undefined ||
        def.breaksNextHex !== undefined ||
        def.failsNextSpell !== undefined ||
        def.failsFoeTouchSkills !== undefined ||
        def.damagePulse !== undefined ||
        def.chantShoutDurationMultiplier !== 1 ||
        def.conditionalArmor.length > 0 ||
        def.whileUnder !== undefined ||
        def.extraStrikesPerHit !== 0 ||
        def.attackDamageType !== undefined ||
        def.attackArmorPenetration !== 0 ||
        def.attackDamageDelta !== 0 ||
        def.damageReductionWhileCasting !== undefined ||
        def.onAttackHit !== undefined ||
        def.onAttackBlocked !== undefined ||
        def.triggers.length > 0 ||
        def.nextSpells !== undefined ||
        def.nextAttackSkill !== undefined ||
        def.nextSkill !== undefined ||
        def.nextSkillRule !== undefined ||
        def.nextAttackSkillBonus !== undefined ||
        def.spellRechargeFaster !== 0 ||
        def.skillRechargeFaster !== 0 ||
        def.bindingRitualRechargeFaster !== 0 ||
        def.ownSkillModifiers.length > 0 ||
        def.criticalChanceBonus !== 0 ||
        def.energyPerCritical !== 0 ||
        def.healthPerCritical !== 0 ||
        def.onCriticalHit !== undefined ||
        def.enchantmentsOnBearerCostLess !== 0 ||
        def.damageReduction !== 0 ||
        def.redirectsPhysicalDamage !== 0 ||
        def.damageFromSpiritAttacks !== 0 ||
        def.adrenalineGainFaster !== 0 ||
        def.energyCostMultiplier !== 1 ||
        def.preventsResurrection ||
        def.preventsSpeedBoosts ||
        def.returnsSource !== undefined ||
        def.stepsToTarget !== undefined ||
        def.elementalDamageTakenAs !== undefined ||
        def.minionDamageBonus !== 0 ||
        def.minionHitHealthLossPercent !== 0 ||
        def.redirectsConditionsToMinion ||
        def.physicalDamageDealtAs !== undefined ||
        def.interruptGuard !== undefined ||
        def.damageTypeTakenMultiplier !== undefined;
      expect(hasEffect, `${id} has no mechanical effect`).toBe(true);
    }
  });

  it("keeps each condition's mechanical identity distinct", () => {
    // Burning should drain faster than bleeding — if these ever converge,
    // the two conditions stop being meaningfully different choices.
    expect(statAtTwelve(getStatusDefinition("burning").healthPips)).toBeLessThan(
      statAtTwelve(getStatusDefinition("bleeding").healthPips),
    );
    expect(getStatusDefinition("crippled").moveSpeedMultiplier).toBeLessThan(1);
    expect(getStatusDefinition("blind").attackMissChance).toBeGreaterThan(0.5);
    expect(getStatusDefinition("deep-wound").maxHealthLoss?.fraction).toBeGreaterThan(0);
    expect(getStatusDefinition("deep-wound").healingMultiplier).toBeLessThan(1);
    expect(getStatusDefinition("dazed").castTimeMultiplier).toBeGreaterThan(1);
    expect(getStatusDefinition("weakness")).toMatchObject({
      weaponDamageMultiplier: 0.34,
      attributeDeltas: [{ scope: "all", amount: -1 }],
      armorModifier: 0,
    });
  });

  it("counts health in GW1's pips", () => {
    expect(
      Object.fromEntries(
        ALL_STATUS_IDS.filter((id) => statAtTwelve(getStatusDefinition(id).healthPips) !== 0).map(
          (id) => [id, statAtTwelve(getStatusDefinition(id).healthPips)],
        ),
      ),
    ).toEqual({
      bleeding: -3,
      burning: -7,
      poison: -4,
      disease: -4,
      faintheartedness: -2,
      "parasitic-bond": -1,
      mending: 3,
      regeneration: 4,
      "weapon-of-warding": 4,
      "never-surrender": 4,
      "healing-breeze": 8,
      "shadow-refuge": 9,
      "shield-of-regeneration": 9,
      "watchful-spirit": 2,
      "feigned-neutrality": 7,
      recuperation: 3,
      "well-of-suffering": -5,
      "well-of-blood": 5,
      "well-of-power": 5,
      "well-of-silence": -3,
      "symbiotic-bond": 3,
      "conjure-phantasm": -5,
      "phantom-pain": -3,
      "shrinking-armor": -3,
      "crippling-anguish": -5,
      "enduring-toxin": -4,
      lamentation: -2,
      suffering: -2,
      "lingering-curse": -3,
      "mending-refrain": 3,
      "ice-spear": 3,
      overload: -3,
      migraine: -7,
      wither: -4,
      "life-siphon": -3,
      "life-siphon-regen": 3,
      "corrupt-enchantment": -7,
      "reapers-mark": -4,
      "putrid-bile": -3,
      "blood-renewal": 5,
    });
  });

  it("counts energy in GW1's pips", () => {
    expect(
      Object.fromEntries(
        ALL_STATUS_IDS.filter((id) => getStatusDefinition(id).energyPips !== 0).map((id) => [
          id,
          getStatusDefinition(id).energyPips,
        ]),
      ),
    ).toEqual({
      malaise: -1,
      "blood-ritual": 3,
      "energetic-was-lee-sa": 2,
      "blood-is-power": 5,
      wither: -1,
      "obsidian-flesh": -2,
      "zealous-renewal": -1,
      "zealous-vow": -3,
      "power-flux": -2,
      "the-power-is-yours": 2,
      "well-of-power": 2,
      "well-of-weariness": -1,
    });
  });

  it("makes enchantments beneficial and hexes/conditions detrimental", () => {
    expect(statAtTwelve(getStatusDefinition("regeneration").healthPips)).toBeGreaterThan(0);
    expect(statAtTwelve(getStatusDefinition("armor-boost").armorModifier)).toBeGreaterThan(0);
    expect(statAtTwelve(getStatusDefinition("faintheartedness").healthPips)).toBeLessThan(0);
  });

  it("marks the enchantment party moves with what they do (#1975)", () => {
    expect(getStatusDefinition("air-of-enchantment").enchantmentsOnBearerCostLess).toBe(10);
    expect(getStatusDefinition("order-of-apostasy").onAttackHit).toMatchObject({
      effects: [{ kind: "remove-status", category: "enchantment", count: 1 }],
      sourceLosesPerRemoved: { profession: "monk", percentOfMax: 4 },
    });
    expect(getStatusDefinition("dark-apostasy").onCriticalHit).toEqual({
      effects: [{ kind: "remove-status", category: "enchantment", count: 1 }],
      energyIfRemoved: 4,
      skillId: "assassin.dark-apostasy",
    });
    expect(getStatusDefinition("jaundiced-gaze").ownSkillModifiers).toMatchObject([
      { energyDiscount: 8, energyFloor: 0, activationSecondsLess: 1, uses: 1 },
    ]);
    expect(getStatusDefinition("blind")).toMatchObject({
      enchantmentsOnBearerCostLess: 0,
      onCriticalHit: undefined,
    });
    expect(getStatusDefinition("order-of-pain").onAttackHit?.sourceLosesPerRemoved).toBeUndefined();
  });

  it("sums each status's seconds off its own skills (#1975)", () => {
    const caster = makeCombatant({ id: "c" });
    caster.statuses.apply("jaundiced-gaze", 16, "c", NO_RANKS);
    const enchantment = getSkill("necromancer.order-of-pain");
    expect(enchantment && ownSkillBoost(caster.statuses.active, enchantment)).toMatchObject({
      energyDiscount: 8,
      activationSecondsLess: 1,
    });
  });
});

describe("StatusSet apply/remove", () => {
  it("starts empty", () => {
    const set = new StatusSet();
    expect(set.size).toBe(0);
    expect(set.active).toEqual([]);
  });

  it("applies a status with a duration and source", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "attacker", NO_RANKS);
    expect(set.has("bleeding")).toBe(true);
    expect(set.get("bleeding")?.remainingSeconds).toBe(10);
    expect(set.get("bleeding")?.sourceId).toBe("attacker");
  });

  it("ignores a zero or negative duration", () => {
    const set = new StatusSet();
    set.apply("bleeding", 0, "a", NO_RANKS);
    set.apply("burning", -5, "a", NO_RANKS);
    expect(set.size).toBe(0);
  });

  it("does not stack durations — the longer one wins", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    set.apply("bleeding", 5, "b", NO_RANKS);
    expect(set.get("bleeding")?.remainingSeconds).toBe(10);
    expect(set.get("bleeding")?.sourceId).toBe("a");
  });

  it("refreshes to a longer incoming duration", () => {
    const set = new StatusSet();
    set.apply("bleeding", 5, "a", NO_RANKS);
    set.apply("bleeding", 20, "b", NO_RANKS);
    expect(set.get("bleeding")?.remainingSeconds).toBe(20);
    expect(set.get("bleeding")?.sourceId).toBe("b");
  });

  it("keeps the ranks of whichever application wins the duration (#1976)", () => {
    const strength = (rank: number): ReadonlyMap<string, number> =>
      new Map([["warrior.strength", rank]]);
    const maxHealthBonus = (set: StatusSet): number =>
      aggregateModifiers(set.active).maxHealthBonus;
    const set = new StatusSet();
    set.apply("endure-pain", 16, "w", strength(12));
    // Shorter, at a lower rank: the one running stays, at 258.
    set.apply("endure-pain", 8, "w", strength(0));
    expect(maxHealthBonus(set)).toBe(258);
    // Longer, at a lower rank: the new one wins, and with it 90.
    set.apply("endure-pain", 30, "w", strength(0));
    expect(maxHealthBonus(set)).toBe(90);
  });

  it("removes a single status by id", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    expect(set.remove("bleeding")).toBe(true);
    expect(set.has("bleeding")).toBe(false);
    expect(set.remove("bleeding")).toBe(false);
  });

  it("counts statuses by category", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    set.apply("burning", 10, "a", NO_RANKS);
    set.apply("regeneration", 10, "a", NO_RANKS);
    expect(set.countByCategory("condition")).toBe(2);
    expect(set.countByCategory("enchantment")).toBe(1);
    expect(set.countByCategory("hex")).toBe(0);
  });

  it("removes up to N statuses of one category, leaving other categories alone", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    set.apply("burning", 10, "a", NO_RANKS);
    set.apply("poison", 10, "a", NO_RANKS);
    set.apply("regeneration", 10, "a", NO_RANKS);

    const removed = set.removeByCategory("condition", 2);
    expect(removed).toHaveLength(2);
    expect(set.countByCategory("condition")).toBe(1);
    expect(set.has("regeneration")).toBe(true);
  });

  it("removes every status of a category when no count is given", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    set.apply("burning", 10, "a", NO_RANKS);
    set.apply("regeneration", 10, "a", NO_RANKS);
    expect(set.removeByCategory("condition")).toHaveLength(2);
    expect(set.countByCategory("condition")).toBe(0);
    expect(set.countByCategory("enchantment")).toBe(1);
  });

  it("removing from an empty category is harmless", () => {
    const set = new StatusSet();
    expect(set.removeByCategory("hex", 3)).toEqual([]);
  });

  it("removes the newest first, so a cheap one covers an older one (#521)", () => {
    const set = new StatusSet();
    set.apply("guardian", 10, "a", NO_RANKS);
    set.apply("regeneration", 10, "a", NO_RANKS);
    expect(set.removeByCategory("enchantment", 1)).toEqual([
      { id: "regeneration", sourceSkillId: undefined },
    ]);
    expect(set.has("guardian")).toBe(true);
  });

  it("counts a re-application as the newest, whichever duration wins (#521)", () => {
    for (const duration of [5, 20]) {
      const set = new StatusSet();
      set.apply("guardian", 10, "a", NO_RANKS);
      set.apply("regeneration", 10, "a", NO_RANKS);
      set.apply("guardian", duration, "a", NO_RANKS);
      expect(set.removeByCategory("enchantment", 1), String(duration)).toEqual([
        { id: "guardian", sourceSkillId: undefined },
      ]);
    }
  });

  it("records the skill that put each on, and says it as it removes it (#1928)", () => {
    const set = new StatusSet();
    set.apply("armor-boost", 10, "a", NO_RANKS, null, "elementalist.armor-of-earth");
    set.apply("guardian", 10, "a", NO_RANKS);
    expect(set.get("armor-boost")?.sourceSkillId).toBe("elementalist.armor-of-earth");
    expect(set.removeByCategory("enchantment")).toEqual([
      { id: "guardian", sourceSkillId: undefined },
      { id: "armor-boost", sourceSkillId: "elementalist.armor-of-earth" },
    ]);
  });
});

describe("StatusSet removal by profession (#845)", () => {
  it("takes the newest of that profession's, past a newer one of another", () => {
    const set = new StatusSet();
    set.apply("mystic-regeneration", 10, "a", NO_RANKS);
    set.apply("fleeting-stability", 10, "a", NO_RANKS);
    set.apply("guardian", 10, "b", NO_RANKS);
    expect(set.removeByCategory("enchantment", 1, "dervish")).toEqual([
      { id: "fleeting-stability", sourceSkillId: undefined },
    ]);
    expect(set.has("mystic-regeneration")).toBe(true);
    expect(set.has("guardian")).toBe(true);
  });

  it("takes nothing when only another profession's are up", () => {
    const set = new StatusSet();
    set.apply("guardian", 10, "b", NO_RANKS);
    set.apply("regeneration", 10, "b", NO_RANKS);
    expect(set.removeByCategory("enchantment", 1, "dervish")).toEqual([]);
    expect(set.countByCategory("enchantment")).toBe(2);
  });

  it("ends what ends on a prevented knockdown, and nothing else", () => {
    const set = new StatusSet();
    set.apply("fleeting-stability", 10, "a", NO_RANKS);
    set.apply("mystic-regeneration", 10, "a", NO_RANKS);
    expect(set.endOnKnockdownPrevented()).toEqual(["fleeting-stability"]);
    expect(set.has("mystic-regeneration")).toBe(true);
    expect(set.endOnKnockdownPrevented()).toEqual([]);
  });
});

describe("StatusSet durationSeconds (#803)", () => {
  const order = (set: StatusSet) => set.active.map((status) => status.id);

  it("is the applied duration, and stays as the time runs down", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    set.advance(4, false);
    expect(set.get("bleeding")).toMatchObject({ remainingSeconds: 6, durationSeconds: 10 });
  });

  it("restarts at a longer refresh, which moves to the end", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    set.apply("burning", 5, "a", NO_RANKS);
    set.advance(4, false);
    set.apply("bleeding", 8, "b", NO_RANKS);
    expect(set.get("bleeding")).toMatchObject({ remainingSeconds: 8, durationSeconds: 8 });
    expect(order(set)).toEqual(["burning", "bleeding"]);
  });

  it("keeps its length through a shorter refresh, which still moves to the end", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    set.apply("burning", 5, "a", NO_RANKS);
    set.apply("bleeding", 3, "b", NO_RANKS);
    expect(set.get("bleeding")).toMatchObject({ remainingSeconds: 10, durationSeconds: 10 });
    expect(order(set)).toEqual(["burning", "bleeding"]);
  });

  it("is the caught duration, and a catch never leaves more time than length (#765)", () => {
    const outbreak = { infected: new Set<string>(), refused: new Set<string>() };
    const fresh = new StatusSet();
    fresh.catch("disease", 7, "a", outbreak, NO_RANKS);
    expect(fresh.get("disease")).toMatchObject({ remainingSeconds: 7, durationSeconds: 7 });

    const set = new StatusSet();
    set.apply("disease", 10, "a", NO_RANKS);
    set.advance(6, false);
    set.catch("disease", 8, "b", outbreak, NO_RANKS);
    expect(set.get("disease")).toMatchObject({ remainingSeconds: 8, durationSeconds: 10 });
    set.catch("disease", 12, "b", outbreak, NO_RANKS);
    expect(set.get("disease")).toMatchObject({ remainingSeconds: 12, durationSeconds: 12 });
  });
});

describe("StatusSet stances, one at a time (#523)", () => {
  it("a new stance ends the one that is up", () => {
    const set = new StatusSet();
    set.apply("sprint", 13, "a", NO_RANKS);
    set.apply("dash", 3, "a", NO_RANKS);
    expect(set.active.map((status) => status.id)).toEqual(["dash"]);
  });

  it("the same stance again restarts at its full duration, shorter or not", () => {
    const set = new StatusSet();
    set.apply("sprint", 13, "a", NO_RANKS);
    set.advance(10, false);
    set.apply("sprint", 13, "a", NO_RANKS);
    expect(set.get("sprint")?.remainingSeconds).toBe(13);
    set.apply("sprint", 5, "a", NO_RANKS);
    expect(set.get("sprint")?.remainingSeconds).toBe(5);
  });

  it("leaves the other categories alone, and they leave it alone", () => {
    const set = new StatusSet();
    set.apply("regeneration", 10, "a", NO_RANKS);
    set.apply("bleeding", 10, "b", NO_RANKS);
    set.apply("sprint", 13, "a", NO_RANKS);
    set.apply("dash", 3, "a", NO_RANKS);
    expect(set.countByCategory("enchantment")).toBe(1);
    expect(set.countByCategory("condition")).toBe(1);
    set.removeByCategory("enchantment");
    expect(set.has("dash")).toBe(true);
  });
});

describe("StatusSet duration advance", () => {
  it("counts durations down", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    set.advance(3, false);
    expect(set.get("bleeding")?.remainingSeconds).toBeCloseTo(7, 10);
  });

  it("expires a status once its duration elapses and reports it", () => {
    const set = new StatusSet();
    set.apply("bleeding", 1, "a", NO_RANKS);
    expect(set.advance(1.5, false)).toEqual(["bleeding"]);
    expect(set.has("bleeding")).toBe(false);
  });

  it("expires several at once", () => {
    const set = new StatusSet();
    set.apply("bleeding", 1, "a", NO_RANKS);
    set.apply("burning", 1, "a", NO_RANKS);
    set.apply("poison", 10, "a", NO_RANKS);
    const expired = set.advance(2, false);
    expect(expired.sort()).toEqual(["bleeding", "burning"]);
    expect(set.has("poison")).toBe(true);
  });

  it("reports nothing when nothing expires", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    expect(set.advance(1, false)).toEqual([]);
  });
});

describe("StatusSet changes, for the triggers (#887)", () => {
  it("records a condition newly on the bearer, not its refresh", () => {
    const set = new StatusSet();
    set.apply("burning", 5, "a", NO_RANKS);
    set.apply("burning", 8, "b", NO_RANKS);
    set.apply("burning", 2, "c", NO_RANKS);
    expect(set.drainChanges()).toEqual([
      { kind: "gained-condition", id: "burning", durationSeconds: 5 },
    ]);
    expect(set.drainChanges()).toEqual([]);
  });

  it("records no gained condition for a hex, an enchantment or a stance", () => {
    const set = new StatusSet();
    set.apply("faintheartedness", 5, "a", NO_RANKS);
    set.apply("regeneration", 5, "a", NO_RANKS);
    set.apply("sprint", 5, "a", NO_RANKS);
    expect(set.drainChanges()).toEqual([]);
  });

  it("records a condition caught from an outbreak, once (#765)", () => {
    const set = new StatusSet();
    const outbreak = { infected: new Set<string>(), refused: new Set<string>() };
    set.catch("disease", 6, "a", outbreak, NO_RANKS);
    set.catch("disease", 9, "a", outbreak, NO_RANKS);
    expect(set.drainChanges()).toEqual([
      { kind: "gained-condition", id: "disease", durationSeconds: 6 },
    ]);
  });

  it("records every ending with its source, and only the duration running out as expired (#944)", () => {
    const set = new StatusSet();
    set.apply("parasitic-bond", 1, "expiry", NO_RANKS);
    set.apply("backfire", 10, "removed", NO_RANKS);
    set.apply("malaise", 10, "by-category", NO_RANKS);
    set.apply("watch-yourself", 10, "attacked", NO_RANKS);
    set.apply("glyph-of-lesser-energy", 10, "spells", NO_RANKS);
    set.apply("weapon-of-warding", 10, "attacks", NO_RANKS);
    set.apply("fleeting-stability", 10, "knockdown", NO_RANKS);
    set.drainChanges();

    set.advance(1, false);
    set.remove("backfire");
    set.removeByCategory("hex");
    for (let attack = 0; attack < 3; attack += 1) {
      set.countIncomingAttack();
    }
    set.countSpellStarted();
    set.countSpellStarted();
    set.endOnBearerAttack("melee");
    set.endOnKnockdownPrevented();

    expect(set.drainChanges()).toEqual([
      {
        kind: "ended",
        id: "parasitic-bond",
        sourceId: "expiry",
        expired: true,
        death: false,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "backfire",
        sourceId: "removed",
        expired: false,
        death: false,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "malaise",
        sourceId: "by-category",
        expired: false,
        death: false,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "watch-yourself",
        sourceId: "attacked",
        expired: false,
        death: false,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "glyph-of-lesser-energy",
        sourceId: "spells",
        expired: false,
        death: false,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "weapon-of-warding",
        sourceId: "attacks",
        expired: false,
        death: false,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "fleeting-stability",
        sourceId: "knockdown",
        expired: false,
        death: false,
        returnPoint: null,
        stepTargetId: null,
      },
    ]);
  });

  it("takeNewest takes the newest of a category first, with the time each had left (#944)", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    set.apply("guardian", 10, "a", NO_RANKS);
    set.apply("blind", 8, "a", NO_RANKS);
    set.apply("poison", 6, "a", NO_RANKS);
    set.advance(1, false);
    set.drainChanges();
    expect(set.takeNewest("condition", 2)).toEqual([
      { id: "poison", remainingSeconds: 5, ranks: NO_RANKS },
      { id: "blind", remainingSeconds: 7, ranks: NO_RANKS },
    ]);
    expect(set.active.map(({ id }) => id)).toEqual(["bleeding", "guardian"]);
    expect(set.drainChanges()).toEqual([
      {
        kind: "ended",
        id: "poison",
        sourceId: "a",
        expired: false,
        death: false,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "blind",
        sourceId: "a",
        expired: false,
        death: false,
        returnPoint: null,
        stepTargetId: null,
      },
    ]);
  });

  it("ends Make Haste! on any hit, Defensive Anthem only on an attack skill's (#956)", () => {
    const set = new StatusSet();
    set.apply("make-haste", 17, "p", NO_RANKS);
    set.apply("defensive-anthem", 9, "p", NO_RANKS);
    expect(set.endOnBearerHit(false)).toEqual(["make-haste"]);
    expect(set.has("defensive-anthem")).toBe(true);

    set.apply("make-haste", 17, "p", NO_RANKS);
    expect(set.endOnBearerHit(true)).toEqual(["defensive-anthem", "make-haste"]);
    expect(set.active).toEqual([]);
  });

  it("ends what ends on a skill used, but what that skill spared (#999)", () => {
    const set = new StatusSet();
    set.apply("song-of-restoration", 10, "p", NO_RANKS);
    set.apply("diversion", 6, "foe", NO_RANKS);
    expect(set.endOnBearerUseSkill(new Set(["song-of-restoration"]), false)).toEqual(["diversion"]);
    expect(set.has("song-of-restoration")).toBe(true);

    set.apply("diversion", 6, "foe", NO_RANKS);
    expect(set.endOnBearerUseSkill(new Set(), false)).toEqual(["song-of-restoration", "diversion"]);
    expect(set.active).toEqual([]);
  });

  it("ends Stand Your Ground! on any attack, Escape only on a melee one (#976)", () => {
    const set = new StatusSet();
    set.apply("stand-your-ground", 10, "p", NO_RANKS);
    set.apply("escape", 7, "p", NO_RANKS);
    expect(set.endOnBearerAttack("projectile")).toEqual(["stand-your-ground"]);
    expect(set.has("escape")).toBe(true);

    set.apply("stand-your-ground", 10, "p", NO_RANKS);
    expect([...set.endOnBearerAttack("melee")].sort()).toEqual(["escape", "stand-your-ground"]);
    expect(set.active).toEqual([]);
  });

  it("ends every status on a death, each recorded with its source, in order (#940)", () => {
    const set = new StatusSet();
    set.apply("burning", 5, "a", NO_RANKS);
    set.apply("parasitic-bond", 10, "b", NO_RANKS);
    set.apply("regeneration", 10, "c", NO_RANKS);
    set.apply("sprint", 8, "d", NO_RANKS);
    set.drainChanges();

    set.endAll();

    expect(set.active).toEqual([]);
    expect(set.drainChanges()).toEqual([
      {
        kind: "ended",
        id: "burning",
        sourceId: "a",
        expired: false,
        death: true,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "parasitic-bond",
        sourceId: "b",
        expired: false,
        death: true,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "regeneration",
        sourceId: "c",
        expired: false,
        death: true,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "sprint",
        sourceId: "d",
        expired: false,
        death: true,
        returnPoint: null,
        stepTargetId: null,
      },
    ]);
  });

  it("records nothing for a reset, or a removal of what is not there", () => {
    const set = new StatusSet();
    set.apply("parasitic-bond", 10, "a", NO_RANKS);
    set.drainChanges();
    set.clear();
    set.remove("parasitic-bond");
    expect(set.drainChanges()).toEqual([]);
  });

  it("records a hex it applied only while a status answers that (#1951)", () => {
    const set = new StatusSet();
    set.recordAppliedHex("deep-freeze", "d");
    expect(set.drainChanges()).toEqual([]);

    set.apply("elemental-flame", 17, "a", NO_RANKS);
    set.drainChanges();
    set.recordAppliedHex("deep-freeze", "d");
    expect(set.drainChanges()).toEqual([
      {
        kind: "applied-hex",
        id: "deep-freeze",
        hexedId: "d",
        fired: [
          {
            statusId: "elemental-flame",
            sourceId: "a",
            trigger: getStatusDefinition("elemental-flame").triggers[0],
          },
        ],
      },
    ]);
  });

  it("marks the mantras with what they do (#1964)", () => {
    expect(getStatusDefinition("mantra-of-concentration").interruptGuard).toEqual({ kind: "once" });
    expect(getStatusDefinition("mantra-of-resolve").interruptGuard).toEqual({
      kind: "pay-energy",
      amount: 5,
    });
    expect(getStatusDefinition("mantra-of-frost").damageTypeTakenMultiplier).toEqual({
      type: "cold",
      multiplier: 0.55,
    });
    expect(getStatusDefinition("blind")).toMatchObject({
      interruptGuard: undefined,
      damageTypeTakenMultiplier: undefined,
    });
  });

  it("ends only a once-only interrupt guard when an interrupt is stopped (#1964)", () => {
    const once = new StatusSet();
    once.apply("mantra-of-concentration", 31, "m", NO_RANKS);
    expect(once.endOnInterruptGuarded()).toEqual(["mantra-of-concentration"]);
    expect(once.has("mantra-of-concentration")).toBe(false);

    const paying = new StatusSet();
    paying.apply("mantra-of-resolve", 5, "m", NO_RANKS);
    expect(paying.endOnInterruptGuarded()).toEqual([]);
    expect(paying.has("mantra-of-resolve")).toBe(true);
  });

  it("marks Shadow Form and Mist Form with what they do (#1951)", () => {
    expect(getStatusDefinition("shadow-form")).toMatchObject({
      foeSpellsFail: true,
      attacksAgainstMiss: true,
    });
    expect(getStatusDefinition("mist-form").damageReductionFromHexedSource).toEqual({
      attributeId: "elementalist.water-magic",
      fraction: 0.33,
    });
    expect(getStatusDefinition("blind")).toMatchObject({
      foeSpellsFail: false,
      attacksAgainstMiss: false,
      damageReductionFromHexedSource: undefined,
    });
  });

  it("records a hit and physical damage only while a status answers them (#935)", () => {
    const parasite = {
      statusId: "insidious-parasite",
      sourceId: "a",
      trigger: getStatusDefinition("insidious-parasite").triggers[0],
    };
    const mark = {
      statusId: "mark-of-pain",
      sourceId: "b",
      trigger: getStatusDefinition("mark-of-pain").triggers[0],
    };
    const set = new StatusSet();
    set.apply("backfire", 10, "a", NO_RANKS);
    set.drainChanges();
    set.recordHit(WEAPONS.sword);
    set.recordPhysicalDamage();
    expect(set.drainChanges()).toEqual([]);

    set.apply("insidious-parasite", 13, "a", NO_RANKS);
    set.recordHit(WEAPONS.sword);
    set.recordPhysicalDamage();
    set.recordHit(WEAPONS.sword);
    expect(set.drainChanges()).toEqual([
      { kind: "hit", fired: [parasite] },
      { kind: "hit", fired: [parasite] },
    ]);

    set.apply("mark-of-pain", 30, "b", NO_RANKS);
    set.drainChanges();
    set.recordPhysicalDamage();
    set.recordHit(WEAPONS.sword);
    expect(set.drainChanges()).toEqual([
      { kind: "took-physical-damage", fired: [mark] },
      { kind: "hit", fired: [parasite] },
    ]);
  });

  it("a melee-bound hit trigger answers a sword or a hammer, not a bow nor a thrown spear (#1359)", () => {
    const set = new StatusSet();
    set.apply("warriors-endurance", 29, "w", NO_RANKS);
    set.drainChanges();
    for (const weapon of [WEAPONS.longbow, WEAPONS.spear]) {
      set.recordHit(weapon);
    }
    expect(set.drainChanges()).toEqual([]);
    set.recordHit(WEAPONS.sword);
    set.recordHit(WEAPONS.hammer);
    expect(set.drainChanges()).toHaveLength(2);
  });

  it("a record keeps the triggers it was made with, though they end before the drain (#953)", () => {
    const set = new StatusSet();
    set.apply("mark-of-pain", 30, "b", NO_RANKS);
    set.drainChanges();
    set.recordPhysicalDamage();
    set.endAll();
    set.apply("mark-of-pain", 30, "c", NO_RANKS);
    expect(set.drainChanges()).toEqual([
      {
        kind: "took-physical-damage",
        fired: [
          {
            statusId: "mark-of-pain",
            sourceId: "b",
            trigger: getStatusDefinition("mark-of-pain").triggers[0],
          },
        ],
      },
      {
        kind: "ended",
        id: "mark-of-pain",
        sourceId: "b",
        expired: false,
        death: true,
        returnPoint: null,
        stepTargetId: null,
      },
    ]);
  });

  it("records damage from a foe only while a status answers it, once per status until drained (#1022)", () => {
    const vengeful = {
      statusId: "vengeful-weapon",
      sourceId: "rit",
      trigger: getStatusDefinition("vengeful-weapon").triggers[0],
    };
    const set = new StatusSet();
    set.recordDamageFromFoe("war", "slashing", 10, false);
    expect(set.drainChanges()).toEqual([]);

    set.apply("vengeful-weapon", 8, "rit", NO_RANKS);
    set.drainChanges();
    set.recordDamageFromFoe("war", "slashing", 10, false);
    set.recordDamageFromFoe("ele", "fire", 10, false);
    expect(set.drainChanges()).toEqual([
      { kind: "took-damage-from-foe", offenderId: "war", fired: [vengeful] },
    ]);

    set.recordDamageFromFoe("ele", "fire", 10, false);
    expect(set.drainChanges()).toEqual([
      { kind: "took-damage-from-foe", offenderId: "ele", fired: [vengeful] },
    ]);
  });

  it("answers a trigger bound to fire only for fire, never lightning or a life steal (#1540)", () => {
    const rodgort = {
      statusId: "mark-of-rodgort",
      sourceId: "ele",
      trigger: getStatusDefinition("mark-of-rodgort").triggers[0],
    };
    const set = new StatusSet();
    set.apply("mark-of-rodgort", 30, "ele", NO_RANKS);
    set.drainChanges();
    set.recordDamageFromFoe("ele", "lightning", 10, false);
    set.recordDamageFromFoe("ele", undefined, 10, false);
    expect(set.drainChanges()).toEqual([]);

    set.recordDamageFromFoe("ele", "fire", 10, false);
    expect(set.drainChanges()).toEqual([
      { kind: "took-damage-from-foe", offenderId: "ele", fired: [rodgort] },
    ]);
  });
});

describe("clampPips", () => {
  it("clamps a net pip count to 10 either way", () => {
    expect(clampPips(0)).toBe(0);
    expect(clampPips(7)).toBe(7);
    expect(clampPips(-10)).toBe(-10);
    expect(clampPips(10)).toBe(10);
    expect(clampPips(-14)).toBe(-MAX_PIPS);
    expect(clampPips(23)).toBe(MAX_PIPS);
  });
});

describe("aggregateModifiers, health per enchantment (#845)", () => {
  const pips = (ids: StatusId[]): number =>
    aggregateModifiers(ids.map((id) => ({ id, ranks: NO_RANKS }))).healthPips;

  it("counts every enchantment, itself included, at most 3", () => {
    expect(pips([])).toBe(0);
    expect(pips(["mystic-regeneration"])).toBe(3);
    expect(pips(["mystic-regeneration", "guardian", "fleeting-stability"])).toBe(9);
    expect(pips(["mystic-regeneration", "guardian", "fleeting-stability", "armor-boost"])).toBe(9);
  });

  it("counts no condition, hex or stance, and adds to their pips", () => {
    expect(pips(["mystic-regeneration", "bleeding", "malaise", "heart-of-fury"])).toBe(3 - 3);
  });

  it("is clamped with the rest at MAX_PIPS", () => {
    expect(
      clampPips(pips(["mystic-regeneration", "regeneration", "guardian", "weapon-of-warding"])),
    ).toBe(MAX_PIPS);
  });
});

describe("aggregateModifiers, while under another status (#1485)", () => {
  it("adds Soldier's Fury's speed and adrenaline only while a chant or a shout is up", () => {
    const alone = aggregateModifiers([{ id: "soldiers-fury", ranks: NO_RANKS }]);
    expect([alone.attackDurationMultiplier, alone.adrenalineGainFaster]).toEqual([1, 0]);
    expect(alone.armorModifier).toBe(-20);
    for (const under of ["defensive-anthem", "fall-back"] as const) {
      const both = aggregateModifiers([
        { id: "soldiers-fury", ranks: NO_RANKS },
        { id: under, ranks: NO_RANKS },
      ]);
      expect(both.attackDurationMultiplier, under).toBe(0.67);
      expect(both.adrenalineGainFaster, under).toBeCloseTo(0.33);
      expect(both.armorModifier, under).toBe(-20);
    }
  });

  it("counts neither itself nor another echo as a chant or a shout", () => {
    const echoes = aggregateModifiers([
      { id: "soldiers-fury", ranks: NO_RANKS },
      { id: "mending-refrain", ranks: NO_RANKS },
    ]);
    expect([echoes.attackDurationMultiplier, echoes.adrenalineGainFaster]).toEqual([1, 0]);
  });
});

describe("attackDamageDeltaOf, suppressed while enchanted (#1916)", () => {
  const deltaWith = (...ids: StatusId[]): number => {
    const bearer = makeCombatant({ id: "bearer" });
    for (const id of ids) {
      bearer.statuses.apply(id, 60, "bearer", NO_RANKS);
    }
    return attackDamageDeltaOf(bearer);
  };

  it("drops Brutal Weapon's +13 beside an enchantment, keeps it beside a stance or nothing", () => {
    expect(deltaWith("brutal-weapon")).toBe(13);
    expect(deltaWith("brutal-weapon", "balanced-stance")).toBe(13);
    expect(deltaWith("brutal-weapon", "guardian")).toBe(0);
  });
});

describe("aggregateModifiers", () => {
  it("returns neutral modifiers for no statuses", () => {
    const mods = aggregateModifiers([]);
    expect(mods.healthPips).toBe(0);
    expect(mods.energyPips).toBe(0);
    expect(mods.armorModifier).toBe(0);
    expect(mods.moveSpeedMultiplier).toBe(1);
    expect(mods.attackMissChance).toBe(0);
    expect(mods.maxHealthLoss).toBeUndefined();
    expect(mods.healingMultiplier).toBe(1);
    expect(mods.castTimeMultiplier).toBe(1);
  });

  it("sums additive health degeneration from stacked conditions", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    set.apply("poison", 10, "a", NO_RANKS);
    const mods = aggregateModifiers(set.active);
    expect(mods.healthPips).toBe(
      statAtTwelve(getStatusDefinition("bleeding").healthPips) +
        statAtTwelve(getStatusDefinition("poison").healthPips),
    );
  });

  it("lets a regeneration enchantment offset a degenerating condition", () => {
    const set = new StatusSet();
    set.apply("bleeding", 10, "a", NO_RANKS);
    set.apply("regeneration", 10, "a", NO_RANKS);
    // -3 + 4 = +1: the heal wins, which is exactly the counterplay a
    // regeneration skill is supposed to provide.
    expect(aggregateModifiers(set.active).healthPips).toBeGreaterThan(0);
  });

  it("sums armor modifiers, including a negative one", () => {
    const set = new StatusSet();
    set.apply("armor-boost", 10, "a", NO_RANKS);
    set.apply("healing-signet-armor", 10, "a", NO_RANKS);
    expect(aggregateModifiers(set.active).armorModifier).toBe(24 - 40);
  });

  it("multiplies movement penalties rather than summing them", () => {
    const set = new StatusSet();
    set.apply("crippled", 10, "a", NO_RANKS);
    const mods = aggregateModifiers(set.active);
    expect(mods.moveSpeedMultiplier).toBe(0.5);
  });

  it("takes the worst miss chance rather than compounding it", () => {
    const set = new StatusSet();
    set.apply("blind", 10, "a", NO_RANKS);
    expect(aggregateModifiers(set.active).attackMissChance).toBe(
      getStatusDefinition("blind").attackMissChance,
    );
  });
});

describe("attack duration (ADR-0029)", () => {
  function multiplierWith(statuses: Partial<Record<StatusId, number>>): number {
    return withAttackDuration(statuses, () => {
      const set = new StatusSet();
      for (const id of Object.keys(statuses)) {
        set.apply(id as StatusId, 10, "a", NO_RANKS);
      }
      return aggregateModifiers(set.active).attackDurationMultiplier;
    });
  }

  it("is 1 with nothing on; Faintheartedness (#493) and Shadow of Fear (#918) are 50% slower, Heart of Fury and Weapon of Aggression (#975) 25% faster (#845), Frenzy (#919) and Lightning Reflexes (#976) 33%, Call of Haste (#1108) 25% faster, Aggressive Refrain (#1423, #1516) 25%, Flail (#1549) 33%, Reckless Haste (#1583) 25%, Pious Fury (#1604) 25%, Onslaught (#1667) 25%, Rampage as One (#1865) 33%, Flurry and Heket's Rampage (#1869) 33%, Expert's Dexterity (#1941) 15%, Meekness (#1870) 50% and Sum of All Fears (#1870) 33% slower", () => {
    expect(aggregateModifiers([]).attackDurationMultiplier).toBe(1);
    const multipliers: Partial<Record<StatusId, number>> = {
      faintheartedness: 1.5,
      "heart-of-fury": 0.75,
      "shadow-of-fear": 1.5,
      frenzy: 0.67,
      "lightning-reflexes": 0.67,
      "weapon-of-aggression": 0.75,
      "call-of-haste": 0.75,
      "aggressive-refrain": 0.75,
      flail: 0.67,
      "reckless-haste": 0.75,
      "pious-fury": 0.75,
      onslaught: 0.75,
      "rampage-as-one": 0.67,
      meekness: 1.5,
      "sum-of-all-fears": 1.33,
      flurry: 0.67,
      "hekets-rampage": 0.67,
      "experts-dexterity": 0.85,
    };
    for (const id of ALL_STATUS_IDS) {
      const expected = multipliers[id] ?? 1;
      expect(getStatusDefinition(id).attackDurationMultiplier, id).toBe(expected);
    }
  });

  it("Heart of Fury and Faintheartedness multiply (#845)", () => {
    expect(
      aggregateModifiers([
        { id: "heart-of-fury", ranks: NO_RANKS },
        { id: "faintheartedness", ranks: NO_RANKS },
      ]).attackDurationMultiplier,
    ).toBeCloseTo(0.75 * 1.5);
  });

  it("takes only the strongest speed-up", () => {
    expect(multiplierWith({ bleeding: 0.67 })).toBe(0.67);
    expect(multiplierWith({ bleeding: 0.67, poison: 0.75 })).toBe(0.67);
  });

  it("multiplies the strongest speed-up by the strongest slow-down", () => {
    expect(multiplierWith({ bleeding: 0.67, poison: 1.2 })).toBeCloseTo(0.804, 9);
    expect(multiplierWith({ bleeding: 0.67, poison: 1.2, burning: 1.1 })).toBeCloseTo(0.804, 9);
  });

  it("leaves the table as it was", () => {
    expect(getStatusDefinition("bleeding").attackDurationMultiplier).toBe(1);
  });
});

describe("StatusSet.countIncomingAttack (#524)", () => {
  it("ends a status after its endsAfterAttacks, and leaves the others", () => {
    const set = new StatusSet();
    set.apply("watch-yourself", 10, "w", NO_RANKS);
    set.apply("guardian", 10, "m", NO_RANKS);
    expect(set.countIncomingAttack()).toEqual([]);
    expect(set.countIncomingAttack()).toEqual([]);
    expect(set.countIncomingAttack()).toEqual(["watch-yourself"]);
    expect(set.has("watch-yourself")).toBe(false);
    expect(set.has("guardian")).toBe(true);
  });

  it("starts the count again when the status is applied anew", () => {
    const set = new StatusSet();
    set.apply("watch-yourself", 5, "w", NO_RANKS);
    set.countIncomingAttack();
    set.countIncomingAttack();
    set.apply("watch-yourself", 10, "w", NO_RANKS);
    expect(set.get("watch-yourself")?.attacksLeft).toBe(3);
  });
});

describe("countHit (#939)", () => {
  it("counts a hit with any weapon for a status that names none (#1022)", () => {
    const set = new StatusSet();
    set.apply("splinter-weapon", 20, "rit", NO_RANKS);
    set.apply("sand-shards", 20, "dervish", NO_RANKS);
    expect(set.countHit("sword")).toEqual([]);
    expect(set.countHit("flatbow")).toEqual([]);
    expect(set.countHit("spear")).toEqual([]);
    expect(set.get("splinter-weapon")?.hitsLeft).toBe(1);
    expect(set.get("sand-shards")?.hitsLeft).toBe(4);
    expect(set.countHit("sword")).toEqual(["splinter-weapon"]);
    expect(set.has("splinter-weapon")).toBe(false);
  });
});

describe("onAttackBlocked (#1974)", () => {
  function wielding(weapon: Weapon): ResolvedEquipment {
    return {
      ...unarmedResolvedEquipment(60),
      mainHand: {
        weapon,
        attributeId: "ranger.marksmanship",
        damageType: weapon.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    };
  }

  /** The riders Glass Arrows fires when `weapon`'s blow on a foe is blocked. */
  function blocked(weapon: Weapon, withAttackSkill: boolean): FiredTrigger[] {
    const archer = makeCombatant({ id: "archer", equipment: wielding(weapon) });
    const foe = makeCombatant({ id: "foe", team: 1 });
    archer.statuses.apply("glass-arrows", 30, "archer", NO_RANKS);
    const fired: FiredTrigger[] = [];
    attackBlockedRiders(
      archer,
      foe,
      archer.equipment.mainHand,
      withAttackSkill,
      createRng(1),
      MINIMAL_GW_INSPIRED_PVP_V1.combat,
      new Map([
        [
          "archer",
          { combatant: archer, position: vec2(0, 0), creature: undefined, corpseExploited: false },
        ],
        [
          "foe",
          { combatant: foe, position: vec2(600, 0), creature: undefined, corpseExploited: false },
        ],
      ]),
      fired,
      [],
    );
    return fired;
  }

  it("Glass Arrows Bleeds whoever blocks an arrow for 18 s, a plain shot's or an attack skill's", () => {
    for (const withAttackSkill of [false, true]) {
      expect(blocked(WEAPONS.longbow, withAttackSkill)).toEqual([
        {
          sourceId: "archer",
          skillId: "ranger.glass-arrows",
          events: [
            expect.objectContaining({
              kind: "status-applied",
              targetId: "foe",
              statusId: "bleeding",
            }),
          ],
        },
      ]);
    }
  });

  it("a sword's blocked blow fires nothing", () => {
    expect(blocked(WEAPONS.sword, false)).toEqual([]);
  });
});
