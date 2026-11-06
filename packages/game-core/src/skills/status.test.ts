import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
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
  nextSkillAnswers,
  ownSkillBoost,
  scaledStatAttributes,
  type StatusId,
  type StatusStat,
} from "./status.js";
import { statAtTwelve } from "./scaling.js";

const BLOOD = "necromancer.blood-magic";
import { makeCombatant, withAttackDuration } from "./testing.js";
import { attackDamageDeltaOf } from "./tick.js";
import type { FiredTrigger } from "./triggers.js";
import type { Skill } from "./types.js";
import { attackBlockedRiders } from "./weapon-attack.js";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

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
        statAtTwelve(def.healthPipsPerCondition) !== 0 ||
        def.healthPipsPerHex !== 0 ||
        def.energyPipsPerCondition !== 0 ||
        def.energyPipsPerHex !== 0 ||
        def.preventsKnockdown ||
        def.preventsSpells ||
        def.preventsBlocking ||
        def.unblockableBySource ||
        def.unblockableByBlinded ||
        def.unblockableAttacks !== undefined ||
        def.attacksUnblockable ||
        statAtTwelve(def.energyPips) !== 0 ||
        def.armorModifier !== 0 ||
        def.armorWhileStill !== 0 ||
        def.healthPerSecondWhileMoving !== 0 ||
        def.healthPerSecond !== 0 ||
        def.healthPerSecondNearSpirit !== 0 ||
        def.armorReduction !== undefined ||
        statAtTwelve(def.moveSpeedMultiplier) !== 1 ||
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
        def.skillActivationMultiplier !== 1 ||
        def.interruptsSpells ||
        def.untargetableByFoeSpells ||
        def.preventsEnchantments ||
        def.preventsShoutsAndChants ||
        def.preventsSignets ||
        def.attackDurationMultiplier !== 1 ||
        def.conditionDurationMultiplier !== 1 ||
        def.upkeepMultiplier !== 1 ||
        def.overcastSurcharge !== 0 ||
        def.projectileSpeedMultiplier !== 1 ||
        def.block !== undefined ||
        def.projectsAura !== undefined ||
        def.maxDamageFractionPerHit !== undefined ||
        def.attackDamageCapFraction !== undefined ||
        def.lifeStealReduction !== 0 ||
        def.knockdownMinSeconds !== undefined ||
        def.reversesNextDamage !== undefined ||
        def.nextDamageReduction !== undefined ||
        def.reflectsNextDamage !== undefined ||
        def.damageToHealing !== undefined ||
        def.pulse !== undefined ||
        def.reflectsAttackDamage !== undefined ||
        def.damageDealtMultiplier !== 1 ||
        def.killsBearerOnEnd ||
        def.nextIncomingHexDurationMultiplier !== undefined ||
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
        def.damageReductionPerHitTaken !== undefined ||
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
        def.redirectsDamage !== undefined ||
        def.redirectsDamageToMinion !== 0 ||
        def.replacedOnDeathBy !== undefined ||
        def.damageFromSpiritAttacks !== 0 ||
        def.adrenalineGainFaster !== 0 ||
        def.energyCostMultiplier !== 1 ||
        def.preventsResurrection ||
        def.preventsSpeedBoosts ||
        def.preventsAdrenalineGain ||
        def.returnsSource !== undefined ||
        def.stepsToTarget !== undefined ||
        def.elementalDamageTakenAs !== undefined ||
        def.minionDamageBonus !== 0 ||
        def.minionHitHealthLossPercent !== 0 ||
        def.redirectsConditionsToMinion ||
        def.physicalDamageDealtAs !== undefined ||
        def.moveSpeedWhileEnchanted !== 1 ||
        def.incomingAllySpellCastTimeMultiplier !== 1 ||
        def.interruptGuard !== undefined ||
        def.damageTypeTakenMultiplier !== undefined ||
        def.damageReductionFromSourceWith !== undefined ||
        def.bindsCreatures ||
        def.conditionsExpireFaster !== 0 ||
        def.hexesExpireFaster !== 0 ||
        statAtTwelve(def.enchantmentsExpireFaster) !== 0 ||
        statAtTwelve(def.stancesExpireFaster) !== 0 ||
        def.refuses.length > 0 ||
        def.preventsCriticalHits;
      expect(hasEffect, `${id} has no mechanical effect`).toBe(true);
    }
  });

  it("keeps each condition's mechanical identity distinct", () => {
    // Burning should drain faster than bleeding — if these ever converge,
    // the two conditions stop being meaningfully different choices.
    expect(statAtTwelve(getStatusDefinition("burning").healthPips)).toBeLessThan(
      statAtTwelve(getStatusDefinition("bleeding").healthPips),
    );
    expect(statAtTwelve(getStatusDefinition("crippled").moveSpeedMultiplier)).toBeLessThan(1);
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
      "veratas-sacrifice": 10,
      "conjure-phantasm": -5,
      "phantom-pain": -3,
      "shrinking-armor": -3,
      "crippling-anguish": -5,
      "enduring-toxin": -4,
      lamentation: -2,
      suffering: -2,
      "swirling-aura": 5,
      "lingering-curse": -3,
      "mending-refrain": 3,
      "ice-spear": 3,
      overload: -3,
      migraine: -7,
      "conjure-nightmare": -8,
      "images-of-remorse": -2.6,
      "illusion-of-pain": -8.6,
      wither: -4,
      "life-siphon": -3,
      "life-siphon-regen": 3,
      "corrupt-enchantment": -7,
      "reapers-mark": -4,
      "putrid-bile": -3,
      "blood-renewal": 5,
      "vampiric-spirit": 9,
      "ward-against-harm": 2.6,
      "life-transfer": -7,
      "life-transfer-regen": 7,
      "weaken-knees": -3.4,
      succor: 1,
      "restful-breeze": 10,
      "vile-miasma": -4.2,
      "i-will-avenge-you": 6,
      "watchful-healing": 3.4,
      "hexers-vigor": 6.6,
      "mark-of-insecurity": -4.2,
    });
  });

  it("counts energy in GW1's pips", () => {
    expect(
      Object.fromEntries(
        ALL_STATUS_IDS.filter((id) => statAtTwelve(getStatusDefinition(id).energyPips) !== 0).map(
          (id) => [id, Math.round(statAtTwelve(getStatusDefinition(id).energyPips))],
        ),
      ),
    ).toEqual({
      malaise: -1,
      "blood-ritual": 3,
      "energetic-was-lee-sa": 2,
      "blood-is-power": 5,
      "ether-prodigy": 6,
      "ether-lord": -3,
      "ether-lord-regeneration": 3,
      "ether-phantom": -1,
      wither: -1,
      "obsidian-flesh": -2,
      "zealous-renewal": -1,
      "zealous-vow": -2,
      "power-flux": -2,
      "song-of-power": 4,
      "the-power-is-yours": 2,
      "well-of-power": 2,
      "well-of-weariness": -1,
      "lyssas-aura": 4,
      succor: 1,
      "signet-of-recall": -4,
      "spirit-channeling": 5,
    });
  });

  it("reads a scaled status's energy pips at its source's rank (#2328)", () => {
    const pips = (id: StatusId, attributeId: string, rank: number): number =>
      aggregateModifiers([{ id, ranks: new Map([[attributeId, rank]]) }]).energyPips;
    const table: readonly (readonly [StatusId, string, number, number])[] = [
      ["blood-is-power", "necromancer.blood-magic", 3, 5],
      ["lyssas-aura", "mesmer.inspiration-magic", 0, 4],
      ["the-power-is-yours", "paragon.motivation", 1, 2],
      ["ether-lord", "mesmer.inspiration-magic", -1, -3],
      ["ether-lord-regeneration", "mesmer.inspiration-magic", 1, 3],
    ];
    for (const [id, attributeId, atZero, atTwelve] of table) {
      expect([pips(id, attributeId, 0), pips(id, attributeId, 12)], id).toEqual([atZero, atTwelve]);
    }
    expect(scaledStatAttributes("blood-is-power")).toEqual(["necromancer.blood-magic"]);
    expect(getStatusDefinition("zealous-vow").energyPips).toBe(-2);
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
      endsWhenFired: false,
      skillId: "assassin.dark-apostasy",
    });
    expect(getStatusDefinition("jaundiced-gaze").ownSkillModifiers).toMatchObject([
      {
        energyDiscount: { scaling: { attributeId: BLOOD, atZero: 1, atTwelve: 8.2 } },
        energyFloor: 0,
        activationSecondsLess: { scaling: { attributeId: BLOOD, atZero: 0, atTwelve: 0.8 } },
        uses: 1,
      },
    ]);
    expect(getStatusDefinition("blind")).toMatchObject({
      enchantmentsOnBearerCostLess: 0,
      onCriticalHit: undefined,
    });
    expect(getStatusDefinition("order-of-pain").onAttackHit?.sourceLosesPerRemoved).toBeUndefined();
  });

  it("takes its caster's Blood Magic for the Energy and seconds off its own skills (#1975, #2158)", () => {
    const enchantment = getSkill("necromancer.order-of-pain");
    if (enchantment === undefined) {
      throw new Error("missing necromancer.order-of-pain");
    }
    const boostAt = (rank: number) => {
      const caster = makeCombatant({ id: "c" });
      caster.statuses.apply("jaundiced-gaze", 16, "c", new Map([[BLOOD, rank]]));
      return ownSkillBoost(caster.statuses.active, enchantment);
    };
    expect(boostAt(0)).toMatchObject({ energyDiscount: 1, activationSecondsLess: 0 });
    // 8.2 Energy, whole; 0.8 s, not rounded.
    expect(boostAt(12).energyDiscount).toBe(8);
    expect(boostAt(12).activationSecondsLess).toBeCloseTo(0.8);
    // Its ranks are read in Blood Magic alone.
    expect(scaledStatAttributes("jaundiced-gaze")).toEqual([BLOOD]);
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

describe("StatusSet refuses (#2373)", () => {
  it("keeps a Burning already on the bearer running", () => {
    const set = new StatusSet();
    set.apply("burning", 5, "a", NO_RANKS);
    set.apply("frigid-armor", 20, "s", NO_RANKS);
    expect(set.get("burning")?.remainingSeconds).toBe(5);
    set.advance(1, false);
    expect(set.get("burning")?.remainingSeconds).toBeCloseTo(4, 10);
  });

  it("refuses a new Burning, applied or caught, as immuneTo does", () => {
    const set = new StatusSet();
    set.apply("frigid-armor", 20, "s", NO_RANKS);
    expect(set.isImmuneTo("burning")).toBe(true);
    expect(set.apply("burning", 5, "a", NO_RANKS)).toBe(false);
    set.catch(
      "burning",
      5,
      "a",
      { infected: new Set<string>(), refused: new Set<string>() },
      NO_RANKS,
    );
    expect(set.has("burning")).toBe(false);
    expect(set.isImmuneTo("bleeding")).toBe(false);
  });
});

describe("StatusSet enchantments and stances expire faster (#2373)", () => {
  const DEADLY = new Map([["assassin.deadly-arts", 12]]);

  it("Air of Disenchantment runs enchantments 1 + 2.7 times as fast, and nothing else", () => {
    const set = new StatusSet();
    set.apply("gust", 10, "s", NO_RANKS);
    set.apply("bonettis-defense", 10, "s", NO_RANKS);
    set.apply("air-of-disenchantment", 30, "m", new Map([["mesmer.illusion-magic", 12]]));
    set.advance(1, false);
    expect(set.get("gust")?.remainingSeconds).toBeCloseTo(10 - 3.7, 10);
    expect(set.get("bonettis-defense")?.remainingSeconds).toBeCloseTo(9, 10);
    expect(set.get("air-of-disenchantment")?.remainingSeconds).toBeCloseTo(29, 10);
  });

  it("Mark of Insecurity runs both 52% faster at rank 12, 20% at rank 0", () => {
    for (const [ranks, faster] of [
      [DEADLY, 0.52],
      [NO_RANKS, 0.2],
    ] as const) {
      const set = new StatusSet();
      set.apply("gust", 10, "s", NO_RANKS);
      set.apply("bonettis-defense", 10, "s", NO_RANKS);
      set.apply("mark-of-insecurity", 30, "a", ranks);
      set.advance(1, false);
      expect(set.get("gust")?.remainingSeconds).toBeCloseTo(9 - faster, 10);
      expect(set.get("bonettis-defense")?.remainingSeconds).toBeCloseTo(9 - faster, 10);
    }
  });

  it("stacks additively, and the time lost stays lost once the hex is gone", () => {
    const set = new StatusSet();
    set.apply("gust", 10, "s", NO_RANKS);
    set.apply("mark-of-insecurity", 30, "a", DEADLY);
    set.apply("air-of-disenchantment", 30, "m", new Map([["mesmer.illusion-magic", 12]]));
    set.advance(1, false);
    expect(set.get("gust")?.remainingSeconds).toBeCloseTo(10 - (1 + 0.52 + 2.7), 10);
    set.remove("mark-of-insecurity");
    set.remove("air-of-disenchantment");
    set.advance(1, false);
    expect(set.get("gust")?.remainingSeconds).toBeCloseTo(10 - (1 + 0.52 + 2.7) - 1, 10);
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
        heldSeconds: 1,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "backfire",
        sourceId: "removed",
        expired: false,
        death: false,
        heldSeconds: 1,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "malaise",
        sourceId: "by-category",
        expired: false,
        death: false,
        heldSeconds: 1,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "watch-yourself",
        sourceId: "attacked",
        expired: false,
        death: false,
        heldSeconds: 1,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "glyph-of-lesser-energy",
        sourceId: "spells",
        expired: false,
        death: false,
        heldSeconds: 1,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "weapon-of-warding",
        sourceId: "attacks",
        expired: false,
        death: false,
        heldSeconds: 1,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "fleeting-stability",
        sourceId: "knockdown",
        expired: false,
        death: false,
        heldSeconds: 1,
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
        heldSeconds: 1,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "blind",
        sourceId: "a",
        expired: false,
        death: false,
        heldSeconds: 1,
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

  it("ends Hexer's Vigor on any skill but a hex, or the one that spared it (#2411)", () => {
    const vigor = (): StatusSet => {
      const set = new StatusSet();
      set.apply("hexers-vigor", 10, "p", NO_RANKS);
      return set;
    };
    for (const id of ["monk.healing-breeze", "warrior.healing-signet", "warrior.sprint"]) {
      expect(vigor().endOnBearerUseSkill(new Set(), skill(id))).toEqual(["hexers-vigor"]);
    }
    expect(vigor().endOnBearerUseSkill(new Set(), skill("necromancer.faintheartedness"))).toEqual(
      [],
    );
    expect(
      vigor().endOnBearerUseSkill(new Set(["hexers-vigor"]), skill("necromancer.hexers-vigor")),
    ).toEqual([]);
  });

  it('nextSkillAnswers("hex") answers a hex only (#2411)', () => {
    expect(nextSkillAnswers("hex", skill("necromancer.faintheartedness"))).toBe(true);
    expect(nextSkillAnswers("hex", skill("monk.healing-breeze"))).toBe(false);
  });

  it("ends Battle Rage on a non-adrenal skill, Disciplined Stance on an adrenal one (#2411)", () => {
    // One stance at a time: each on its own.
    const stance = (id: StatusId): StatusSet => {
      const set = new StatusSet();
      set.apply(id, 10, "p", NO_RANKS);
      return set;
    };
    const adrenal = skill("warrior.backbreaker");
    const plain = skill("warrior.healing-signet");
    expect(stance("battle-rage").endOnBearerUseSkill(new Set(), adrenal)).toEqual([]);
    expect(stance("battle-rage").endOnBearerUseSkill(new Set(), plain)).toEqual(["battle-rage"]);
    expect(stance("disciplined-stance").endOnBearerUseSkill(new Set(), adrenal)).toEqual([
      "disciplined-stance",
    ]);
    expect(stance("disciplined-stance").endOnBearerUseSkill(new Set(), plain)).toEqual([]);
  });

  it("ends what ends on a skill used, but what that skill spared (#999)", () => {
    const set = new StatusSet();
    set.apply("song-of-restoration", 10, "p", NO_RANKS);
    set.apply("diversion", 6, "foe", NO_RANKS);
    expect(
      set.endOnBearerUseSkill(new Set(["song-of-restoration"]), skill("monk.healing-breeze")),
    ).toEqual(["diversion"]);
    expect(set.has("song-of-restoration")).toBe(true);

    set.apply("diversion", 6, "foe", NO_RANKS);
    expect(set.endOnBearerUseSkill(new Set(), skill("monk.healing-breeze"))).toEqual([
      "song-of-restoration",
      "diversion",
    ]);
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

  it("ends Protector's Defense when its bearer moves, and nothing else (#2096)", () => {
    const set = new StatusSet();
    set.apply("protectors-defense", 7, "p", NO_RANKS);
    set.apply("stand-your-ground", 10, "p", NO_RANKS);
    expect(set.endOnBearerMove()).toEqual(["protectors-defense"]);
    expect(set.has("stand-your-ground")).toBe(true);
    expect(set.endOnBearerMove()).toEqual([]);
  });

  it("has Protector's Defense project its block to adjacent allies, not its bearer (#2096)", () => {
    expect(getStatusDefinition("protectors-defense").projectsAura).toEqual({
      statusId: "protectors-defense-block",
      affects: "allies",
      radius: AREA_ADJACENT,
      excludesSource: true,
    });
    expect(getStatusDefinition("protectors-defense-block").block).toEqual({
      chance: 0.75,
      against: "all",
    });
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
        heldSeconds: 0,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "parasitic-bond",
        sourceId: "b",
        expired: false,
        death: true,
        heldSeconds: 0,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "regeneration",
        sourceId: "c",
        expired: false,
        death: true,
        heldSeconds: 0,
        returnPoint: null,
        stepTargetId: null,
      },
      {
        kind: "ended",
        id: "sprint",
        sourceId: "d",
        expired: false,
        death: true,
        heldSeconds: 0,
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

  it("records each time a foe takes aim only while a status answers that (#2095)", () => {
    const set = new StatusSet();
    set.recordTargetedByFoe("f");
    expect(set.drainChanges()).toEqual([]);

    set.apply("sliver-armor", 10, "e", NO_RANKS);
    set.drainChanges();
    set.recordTargetedByFoe("f");
    set.recordTargetedByFoe("g");
    const fired = [
      {
        statusId: "sliver-armor",
        sourceId: "e",
        trigger: getStatusDefinition("sliver-armor").triggers[0],
      },
    ];
    expect(set.drainChanges()).toEqual([
      { kind: "targeted-by-foe", offenderId: "f", fired },
      { kind: "targeted-by-foe", offenderId: "g", fired },
    ]);
  });

  it("answers a hit by its source's attack of the role it names, and no one else's (#2134)", () => {
    const set = new StatusSet();
    set.apply("mark-of-instability", 20, "s", NO_RANKS);
    set.drainChanges();
    set.recordHitByAttack("s", 30, "lead", WEAPONS.sword);
    set.recordHitByAttack("s", 30, undefined, WEAPONS.sword);
    set.recordHitByAttack("a", 30, "dual", WEAPONS.sword);
    expect(set.drainChanges()).toEqual([]);
    set.recordHitByAttack("s", 30, "dual", WEAPONS.sword);
    expect(set.drainChanges()).toEqual([
      {
        kind: "hit-by-attack",
        offenderId: "s",
        fired: [
          {
            statusId: "mark-of-instability",
            sourceId: "s",
            trigger: getStatusDefinition("mark-of-instability").triggers[0],
          },
        ],
      },
    ]);
  });

  it("frees and hastens only the chain roles Way of the Empty Palm names (#2134)", () => {
    const set = new StatusSet();
    set.apply("way-of-the-empty-palm", 13, "s", new Map([["assassin.deadly-arts", 12]]));
    const boost = (id: string) => {
      const found = getSkill(id);
      if (found === undefined) {
        throw new Error(`missing ${id}`);
      }
      return ownSkillBoost(set.active, found);
    };
    expect(boost("assassin.death-blossom")).toMatchObject({ energyBase: 0, rechargeFaster: 0.45 });
    expect(boost("assassin.fox-fangs")).toMatchObject({ energyBase: 0, rechargeFaster: 0.45 });
    expect(boost("assassin.jagged-strike")).toMatchObject({
      energyBase: undefined,
      rechargeFaster: 0,
    });
    expect(boost("assassin.shadow-prison")).toMatchObject({
      energyBase: undefined,
      rechargeFaster: 0,
    });
  });

  it("recharges 25% faster at Deadly Arts 0, 45% at 12 (#2158)", () => {
    const deathBlossom = getSkill("assassin.death-blossom");
    if (deathBlossom === undefined) {
      throw new Error("missing assassin.death-blossom");
    }
    const rechargeAt = (rank: number) => {
      const set = new StatusSet();
      set.apply("way-of-the-empty-palm", 13, "s", new Map([["assassin.deadly-arts", rank]]));
      return ownSkillBoost(set.active, deathBlossom).rechargeFaster;
    };
    expect(rechargeAt(0)).toBeCloseTo(0.25);
    expect(rechargeAt(12)).toBeCloseTo(0.45);
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
        heldSeconds: 0,
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

  it("is 1 with nothing on; Faintheartedness (#493) and Shadow of Fear (#918) are 50% slower, Heart of Fury and Weapon of Aggression (#975) 25% faster (#845), Frenzy (#919) and Lightning Reflexes (#976) 33%, Call of Haste (#1108) 25% faster, Aggressive Refrain (#1423, #1516) 25%, Flail (#1549) 33%, Reckless Haste (#1583) 25%, Pious Fury (#1604) 25%, Onslaught (#1667) 25%, Rampage as One (#1865) 33%, Flurry and Heket's Rampage (#1869) 33%, Expert's Dexterity (#1941) 15%, Tiger Stance and Berserker Stance (#2181) 33%, Tiger's Fury (#2190) and Bestial Fury (#2317) 25%, Feral Aggression (#2317) 33%, Rapid Fire (#2189) 33% with a bow, Way of the Assassin (#2275) 5...20% with daggers, Dwarven Battle Stance (#2335) 33% with a hammer, I Will Avenge You! (#2320) 25%, Burst of Aggression (#2320) 33%, Primal Rage (#2406) 33%, Meekness (#1870) 50% and Sum of All Fears (#1870) 33% slower", () => {
    expect(aggregateModifiers([]).attackDurationMultiplier).toBe(1);
    const multipliers: Partial<Record<StatusId, StatusStat>> = {
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
      "tiger-stance": 0.67,
      "berserker-stance": 0.67,
      "rapid-fire": 0.67,
      "dwarven-battle-stance": 0.67,
      "tigers-fury": 0.75,
      "bestial-fury": 0.75,
      "feral-aggression": 0.67,
      "way-of-the-assassin": {
        scaling: { attributeId: "assassin.critical-strikes", atZero: 0.95, atTwelve: 0.83 },
      },
      "i-will-avenge-you": 0.75,
      "burst-of-aggression": 0.67,
      "primal-rage": 0.67,
    };
    for (const id of ALL_STATUS_IDS) {
      const expected = multipliers[id] ?? 1;
      expect(getStatusDefinition(id).attackDurationMultiplier, id).toStrictEqual(expected);
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

describe("StatusSet.castSpell (#1614, #2132)", () => {
  it("renews Lyssa's Aura only for a spell at a foe, and Kinetic Armor for any", () => {
    expect(getStatusDefinition("lyssas-aura").renewsOnBearerSpellAtFoe).toBe(true);
    expect(getStatusDefinition("kinetic-armor").renewsOnBearerSpellAtFoe).toBe(false);
    const set = new StatusSet();
    set.apply("lyssas-aura", 10, "m", NO_RANKS);
    set.apply("kinetic-armor", 12, "m", NO_RANKS);
    set.advance(7, false);
    set.castSpell(false);
    expect(set.get("lyssas-aura")?.remainingSeconds).toBeCloseTo(3);
    expect(set.get("kinetic-armor")?.remainingSeconds).toBe(12);
    set.castSpell(true);
    expect(set.get("lyssas-aura")?.remainingSeconds).toBe(10);
  });
});

describe("StatusSet.recordInterrupt (#1473, #2132)", () => {
  it("carries the skill interrupted, and none for a plain swing", () => {
    const set = new StatusSet();
    set.apply("persistence-of-memory", 17, "m", NO_RANKS);
    set.recordInterrupt("foe", { skillId: "mesmer.empathy", key: "mesmer.empathy" });
    set.recordInterrupt("foe", undefined);
    expect(
      set.drainChanges().map((change) => change.kind === "interrupted" && change.skill),
    ).toEqual([{ skillId: "mesmer.empathy", key: "mesmer.empathy" }, undefined]);
  });
});

describe("rank-scaled speed and reversal (#2428)", () => {
  const FIRE = "elementalist.fire-magic";
  const speed = (set: StatusSet): number => aggregateModifiers(set.active).moveSpeedMultiplier;

  it.each([
    [0, 1.3],
    [12, 1.42],
  ])("Burning Speed at Fire Magic %i moves %f times as fast", (rank, multiplier) => {
    const set = new StatusSet();
    set.apply("burning-speed", 7, "e", new Map([[FIRE, rank]]));
    expect(speed(set)).toBeCloseTo(multiplier);
  });

  it("is barred like any boost by preventsSpeedBoosts", () => {
    const set = new StatusSet();
    set.apply("muddy-terrain", 10, "r", NO_RANKS);
    set.apply("burning-speed", 7, "e", new Map([[FIRE, 12]]));
    expect(speed(set)).toBeCloseTo(0.9);
  });

  it("leaves a flat speed as it was: Crippled and Dash", () => {
    const set = new StatusSet();
    set.apply("crippled", 10, "a", NO_RANKS);
    expect(speed(set)).toBe(0.5);
    set.apply("dash", 3, "a", NO_RANKS);
    expect(speed(set)).toBe(0.75);
  });

  it.each([
    [0, 20],
    [12, 84],
  ])("Life Sheath at Protection Prayers %i caps its reversal at %i", (rank, cap) => {
    const set = new StatusSet();
    set.apply("life-sheath", 8, "monk", new Map([["monk.protection-prayers", rank]]));
    expect(set.takeReversal()).toEqual({ id: "life-sheath", cap });
  });
});
