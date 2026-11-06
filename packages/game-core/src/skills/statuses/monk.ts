import { AREA_ADJACENT, AREA_EARSHOT } from "../../distances.js";
import type { StatusDefinition } from "../status.js";
import { KNOCKDOWN_SECONDS, type HealEffect, type SkillEffect } from "../types.js";
import { define, ownSkills } from "./define.js";

export type MonkStatusId =
  | "reversal-of-damage"
  | "spotless-mind"
  | "spotless-soul"
  | "mark-of-protection"
  | "protective-bond"
  | "divine-spirit"
  | "blessed-aura"
  | "healers-covenant"
  | "holy-haste"
  | "guardian"
  | "mending"
  | "patient-spirit"
  | "holy-veil"
  | "aegis"
  | "shield-of-deflection"
  | "shielding-hands"
  | "spell-breaker"
  | "healing-breeze"
  | "protective-spirit"
  | "reversal-of-fortune"
  | "vigorous-spirit"
  | "scourge-enchantment"
  // Monk smiting staples (#1519).
  | "judges-insight"
  // Monk staples 5 (#1650).
  | "shield-of-regeneration"
  // Monk staples 6 (#1748).
  | "live-vicariously"
  | "purifying-veil"
  | "pacifism"
  | "watchful-spirit"
  // Monk mechanics (#1754).
  | "spirit-bond"
  | "holy-wrath"
  | "balthazars-aura"
  | "judges-intervention"
  | "dwaynas-sorrow"
  // Caster staples (#1870).
  | "aura-of-stability"
  // Caster staples 2 (#1872).
  | "vital-blessing"
  // Skill-type and heal triggers (#1913).
  | "scribes-insight"
  // Blocks that pay (#1974).
  | "shield-guardian"
  // Enchantment party moves (#1975).
  | "air-of-enchantment"
  // Monk mechanics (#2189).
  | "spell-shield"
  | "convert-hexes"
  // Monk staples (#2190).
  | "shield-of-absorption"
  | "divine-intervention"
  | "healing-hands"
  | "shield-of-judgment"
  | "zealots-fire"
  // Monk staples (#2286).
  | "essence-bond"
  | "life-barrier"
  | "retribution"
  | "scourge-healing"
  | "healing-seed"
  | "succor"
  | "divine-boon"
  | "restful-breeze"
  | "life-bond"
  | "life-attunement"
  | "aura-of-faith"
  | "peace-and-harmony"
  | "vengeance"
  | "balthazars-spirit"
  | "watchful-healing"
  | "life-sheath"
  | "reverse-hex"
  // Staples (#2414).
  | "defenders-zeal"
  // Staples (#2367).
  | "strength-of-honor";

/**
 * Shield Guardian's heal (#1974), to the ally that blocked and, by the
 * splash, which skips its centre, to every ally in earshot of it.
 */
const SHIELD_GUARDIAN_HEAL: HealEffect = {
  kind: "heal",
  amount: { scaling: { attributeId: "monk.protection-prayers", atZero: 10, atTwelve: 30 } },
};
const SHIELD_GUARDIAN_HEALS: readonly SkillEffect[] = [
  SHIELD_GUARDIAN_HEAL,
  {
    kind: "splash",
    hits: "allies",
    radius: AREA_EARSHOT,
    maxTargets: undefined,
    effects: [SHIELD_GUARDIAN_HEAL],
  },
];

/**
 * Vigorous Spirit's heal, each time its bearer attacks or casts a spell:
 * scaled by its caster's Healing Prayers, as the trigger's caster is the
 * status's source.
 */
const VIGOROUS_SPIRIT_HEAL: HealEffect = {
  kind: "heal",
  amount: { scaling: { attributeId: "monk.healing-prayers", atZero: 5, atTwelve: 17 } },
};

/** Healing Seed's heal (#2286), to its bearer and, by the splash, which skips its centre, to each ally beside it. */
const HEALING_SEED_HEAL: HealEffect = {
  kind: "heal",
  amount: { scaling: { attributeId: "monk.healing-prayers", atZero: 3, atTwelve: 24.6 } },
};

export const MONK_STATUSES: Readonly<Record<MonkStatusId, StatusDefinition>> = {
  guardian: define("guardian", "Guardian", "enchantment", {
    profession: "monk",
    block: { chance: 0.5, against: "all" },
  }),
  // Mending at rank 12: +3 Health regeneration while maintained (#837).
  mending: define("mending", "Mending", "enchantment", { profession: "monk", healthPips: 3 }),
  // "...Unless Patient Spirit ends prematurely, that ally is healed for
  // 30...102...120 Health when Patient Spirit ends", by its caster's
  // Healing Prayers.
  "patient-spirit": define("patient-spirit", "Patient Spirit", "enchantment", {
    profession: "monk",
    triggers: [
      {
        on: "expires",
        effects: [
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "monk.healing-prayers", atZero: 30, atTwelve: 102 },
            },
          },
        ],
        target: "bearer",
        skillId: "monk.patient-spirit",
      },
    ],
  }),
  // "While you maintain this enchantment, any hexes cast on target other
  // ally take twice as long to cast. When Holy Veil ends, 1 hex is removed
  // from that ally."
  "holy-veil": define("holy-veil", "Holy Veil", "enchantment", {
    profession: "monk",
    incomingHexCastTimeMultiplier: 2,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "remove-status", category: "hex", count: 1 }],
        target: "bearer",
        skillId: "monk.holy-veil",
      },
    ],
  }),
  // "For 6...15 seconds, all party members within earshot have a 50%
  // chance to block attacks" (#1511).
  aegis: define("aegis", "Aegis", "enchantment", {
    profession: "monk",
    block: { chance: 0.5, against: "all" },
  }),
  // "For 3...10 seconds, target ally has a 75% chance to block attacks and
  // gains 15...30 armor" (#1511), at Protection Prayers (#1976).
  "shield-of-deflection": define("shield-of-deflection", "Shield of Deflection", "enchantment", {
    profession: "monk",
    block: { chance: 0.75, against: "all" },
    armorModifier: {
      scaling: { attributeId: "monk.protection-prayers", atZero: 15, atTwelve: 27 },
    },
  }),
  // "For 8 seconds, damage and life steal received by target ally is
  // reduced by 3...18. When Shielding Hands ends, that ally is healed for
  // 5...50 Health": 15 and 41, its rank-12 values (#1511).
  "shielding-hands": define("shielding-hands", "Shielding Hands", "enchantment", {
    profession: "monk",
    damageReduction: 15,
    lifeStealReduction: 15,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "heal", amount: { flat: 41 } }],
        target: "bearer",
        skillId: "monk.shielding-hands",
      },
    ],
  }),
  // "For 5...17 seconds, target ally cannot be the target of enemy
  // spells" (#1511).
  "spell-breaker": define("spell-breaker", "Spell Breaker", "enchantment", {
    profession: "monk",
    untargetableByFoeSpells: true,
  }),
  // "For 15 seconds, target ally gains health regeneration of 4...8...9":
  // +8, its rank-12 value.
  "healing-breeze": define("healing-breeze", "Healing Breeze", "enchantment", {
    profession: "monk",
    healthPips: 8,
  }),
  // "For 5...19...23 seconds, target ally cannot lose more than 10% max
  // Health from a single hit": 19 s, its rank-12 value, on the skill.
  "protective-spirit": define("protective-spirit", "Protective Spirit", "enchantment", {
    profession: "monk",
    maxDamageFractionPerHit: 0.1,
  }),
  // "For 8 seconds, the next time target ally would take damage or life
  // steal, that ally gains that amount of health instead, maximum
  // 15...67...80": the cap at the caster's rank (#2428); the 8 s are the skill's.
  "reversal-of-fortune": define("reversal-of-fortune", "Reversal of Fortune", "enchantment", {
    profession: "monk",
    reversesNextDamage: {
      scaling: { attributeId: "monk.protection-prayers", atZero: 15, atTwelve: 67 },
    },
  }),
  // "...that ally gains that amount of Health instead (maximum 20...100)"
  // (#2428): Reversal of Fortune's, at the caster's rank.
  "life-sheath": define("life-sheath", "Life Sheath", "enchantment", {
    profession: "monk",
    reversesNextDamage: {
      scaling: { attributeId: "monk.protection-prayers", atZero: 20, atTwelve: 84 },
    },
  }),
  // "...the next time target ally would take damage, that damage is
  // reduced by 5...50" (#2428), at the caster's rank.
  "reverse-hex": define("reverse-hex", "Reverse Hex", "enchantment", {
    profession: "monk",
    nextDamageReduction: {
      scaling: { attributeId: "monk.protection-prayers", atZero: 5, atTwelve: 41 },
    },
  }),
  // "For 30 seconds, each time target ally attacks or casts a spell,
  // that ally is healed for 5...17...20 health", at the caster's rank.
  "vigorous-spirit": define("vigorous-spirit", "Vigorous Spirit", "enchantment", {
    profession: "monk",
    triggers: (["bearer-attacks", "bearer-casts-spell"] as const).map((on) => ({
      on,
      effects: [VIGOROUS_SPIRIT_HEAL],
      target: "bearer",
      skillId: "monk.vigorous-spirit",
    })),
  }),
  // "...each time target foe is the target of an enchantment, the caster of
  // that enchantment takes 15...75 damage" (#1403): 63, its rank-12 value.
  "scourge-enchantment": define("scourge-enchantment", "Scourge Enchantment", "hex", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-gains-enchantment",
        effects: [{ kind: "damage", amount: { flat: 63 }, type: "holy", armorPenetration: 0 }],
        target: "gained-source",
        skillId: "monk.scourge-enchantment",
      },
    ],
  }),
  // "...target ally's attacks deal holy damage and have +20% armor
  // penetration" (#1519).
  "judges-insight": define("judges-insight", "Judge's Insight", "enchantment", {
    profession: "monk",
    attackDamageType: "holy",
    attackArmorPenetration: 0.2,
  }),
  // "For 5...13 seconds, target ally gains +3...10 Health regeneration and
  // 20...45 armor": +9 and +40, its rank-12 values (#1650).
  "shield-of-regeneration": define(
    "shield-of-regeneration",
    "Shield of Regeneration",
    "enchantment",
    {
      profession: "monk",
      healthPips: 9,
      armorModifier: 40,
    },
  ),
  // Monk staples 6 (#1748), maintained but Pacifism.
  // "...whenever target ally hits a foe, you gain 2...17 Health", by its
  // caster's Healing Prayers: 14 at rank 12.
  "live-vicariously": define("live-vicariously", "Live Vicariously", "enchantment", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-hits",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "monk.healing-prayers", atZero: 2, atTwelve: 14 } },
          },
        ],
        target: "source",
        skillId: "monk.live-vicariously",
      },
    ],
  }),
  // "...conditions expire 5...50% faster on target ally. When this
  // enchantment ends, one condition is removed from that ally": 41%, its
  // rank-12 value.
  "purifying-veil": define("purifying-veil", "Purifying Veil", "enchantment", {
    profession: "monk",
    conditionsExpireFaster: 0.41,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "remove-status", category: "condition", count: 1 }],
        target: "bearer",
        skillId: "monk.purifying-veil",
      },
    ],
  }),
  // "...target foe cannot attack. This effect ends if the target takes
  // damage." Damage from a foe only: GW1 also ends it on degeneration, which
  // this trigger does not see, so Bleeding leaves it on.
  pacifism: define("pacifism", "Pacifism", "hex", {
    profession: "monk",
    preventsAttacks: true,
    endsWhenTriggered: true,
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        effects: [],
        target: "bearer",
        skillId: "monk.pacifism",
      },
    ],
  }),
  // "...target ally gains +2 Health regeneration. That ally is healed for
  // 30...180 Health when Watchful Spirit ends", by its caster's Divine
  // Favor: 150 at rank 12.
  "watchful-spirit": define("watchful-spirit", "Watchful Spirit", "enchantment", {
    profession: "monk",
    healthPips: 2,
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "monk.divine-favor", atZero: 30, atTwelve: 150 } },
          },
        ],
        target: "bearer",
        skillId: "monk.watchful-spirit",
      },
    ],
  }),
  // "For 8 seconds, whenever target ally takes more than 50 damage from
  // the next 10 attacks or spells, that ally is healed for 30...90
  // Health", by its caster's Protection Prayers (#1754). It counts 10
  // heals, not 10 attacks or spells; in 8 s the two rarely differ.
  "spirit-bond": define("spirit-bond", "Spirit Bond", "enchantment", {
    profession: "monk",
    endsAfterTriggers: 10,
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        minDamage: 50,
        effects: [
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "monk.protection-prayers", atZero: 30, atTwelve: 78 },
            },
          },
        ],
        target: "bearer",
        skillId: "monk.spirit-bond",
      },
    ],
  }),
  // "...the next 1...10 times target other ally takes attack damage, this
  // spell deals 66% of the damage back to the source (maximum 5...50
  // damage)" (#1754): 8 times and 41, their rank-12 values.
  "holy-wrath": define("holy-wrath", "Holy Wrath", "enchantment", {
    profession: "monk",
    reflectsAttackDamage: {
      share: 0.66,
      max: 41,
      type: "holy",
      times: 8,
      skillId: "monk.holy-wrath",
    },
  }),
  // "For 8 seconds, foes adjacent to target ally take 10...30 holy damage
  // each second" (#1754): 26, its rank-12 value.
  "balthazars-aura": define("balthazars-aura", "Balthazar's Aura", "enchantment", {
    profession: "monk",
    damagePulse: {
      damage: 26,
      growth: 0,
      type: "holy",
      radius: AREA_ADJACENT,
      hitsBearer: false,
      skillId: "monk.balthazars-aura",
    },
  }),
  // "...the next time target ally receives damage that would be fatal, the
  // damage is negated and one nearby foe takes 30...180 holy damage"
  // (#1789): the foe whose blow it was, from the Monk; nobody when no foe
  // dealt it.
  "judges-intervention": define("judges-intervention", "Judge's Intervention", "enchantment", {
    profession: "monk",
    negatesFatalDamage: true,
    triggers: [
      {
        on: "bearer-fatal-damage-negated",
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "monk.smiting-prayers", atZero: 30, atTwelve: 150 },
            },
            type: "holy",
            armorPenetration: 0,
          },
        ],
        target: "source-on-offender",
        skillId: "monk.judges-intervention",
      },
    ],
  }),
  // "...If an ally dies while under the effects of Dwayna's Sorrow, your
  // party is healed for 5...50" (#1762): 41, at any distance, as Heal
  // Party's `PartyArea`.
  "dwaynas-sorrow": define("dwaynas-sorrow", "Dwayna's Sorrow", "enchantment", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-dies",
        effects: [
          {
            kind: "splash",
            hits: "party",
            radius: Number.POSITIVE_INFINITY,
            maxTargets: undefined,
            effects: [{ kind: "heal", amount: { flat: 41 } }],
          },
        ],
        target: "bearer",
        skillId: "monk.dwaynas-sorrow",
      },
    ],
  }),
  // Own-skill modifiers (#1761), each at its rank-12 values.
  // "Monk spells cost you 5 less Energy to cast. (Minimum cost: 1 Energy.)"
  "divine-spirit": define("divine-spirit", "Divine Spirit", "enchantment", {
    profession: "monk",
    ownSkillModifiers: [ownSkills({ type: "spell", profession: "monk" }, { energyDiscount: 5 })],
  }),
  // "While you maintain this enchantment, Monk enchantments you cast last
  // 10...35% longer" (#2158). One maintained has no duration to lengthen.
  "blessed-aura": define("blessed-aura", "Blessed Aura", "enchantment", {
    profession: "monk",
    ownSkillModifiers: [
      ownSkills(
        { type: "enchantment", profession: "monk" },
        {
          durationMultiplier: {
            scaling: { attributeId: "monk.divine-favor", atZero: 1.1, atTwelve: 1.3 },
          },
        },
      ),
    ],
  }),
  // "Your Healing Prayers spells heal for 20% less Health, but cost
  // 1...4 less Energy" (#2158). The 20% is the Divine Favor bonus's too.
  "healers-covenant": define("healers-covenant", "Healer's Covenant", "enchantment", {
    profession: "monk",
    ownSkillModifiers: [
      ownSkills(
        { type: "spell", attributeId: "monk.healing-prayers" },
        {
          energyDiscount: {
            scaling: { attributeId: "monk.healing-prayers", atZero: 1, atTwelve: 3.4 },
          },
          healMultiplier: 0.8,
        },
      ),
    ],
  }),
  // "Your Healing Prayers spells cast 50% faster. This enchantment ends if
  // you cast another enchantment."
  "holy-haste": define("holy-haste", "Holy Haste", "enchantment", {
    profession: "monk",
    ownSkillModifiers: [
      ownSkills(
        { type: "spell", attributeId: "monk.healing-prayers" },
        { activationMultiplier: 0.5 },
      ),
    ],
    endsWhenTriggered: true,
    triggers: [
      {
        on: "bearer-uses-skill",
        usedSkill: { type: "enchantment" },
        target: "bearer",
        effects: [],
        skillId: "monk.holy-haste",
      },
    ],
  }),
  // "For 3...7...8 seconds, target other ally cannot be knocked down"
  // (#1870).
  "aura-of-stability": define("aura-of-stability", "Aura of Stability", "enchantment", {
    profession: "monk",
    preventsKnockdown: true,
  }),
  // "While you maintain this enchantment, target ally has +40...200 maximum
  // Health" (#1872), at Protection Prayers (#1976).
  "vital-blessing": define("vital-blessing", "Vital Blessing", "enchantment", {
    profession: "monk",
    maxHealthBonus: {
      scaling: { attributeId: "monk.protection-prayers", atZero: 40, atTwelve: 168 },
    },
  }),
  // "For 10...30...35 seconds, you gain 3 Energy whenever you use a signet"
  // (#1913).
  "scribes-insight": define("scribes-insight", "Scribe's Insight", "enchantment", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-uses-skill",
        usedSkill: { type: "signet" },
        effects: [{ kind: "energy-gain", amount: { flat: 3 } }],
        target: "bearer",
        skillId: "monk.scribes-insight",
      },
    ],
  }),
  // Shield Guardian (PvP): "...all party members in earshot have a 75%
  // chance to block attacks. If an attack is blocked, all allies in
  // earshot are healed for 10...35 Health and Shield Guardian ends"
  // (#1974): 30 at rank 12, by its caster's Protection Prayers. It ends
  // only on the ally that blocked.
  "shield-guardian": define("shield-guardian", "Shield Guardian", "enchantment", {
    profession: "monk",
    block: { chance: 0.75, against: "all" },
    endsAfterTriggers: 1,
    triggers: [
      {
        on: "bearer-blocks-melee",
        target: "bearer",
        effects: SHIELD_GUARDIAN_HEALS,
        skillId: "monk.shield-guardian",
      },
      {
        on: "bearer-blocks-projectile",
        target: "bearer",
        effects: SHIELD_GUARDIAN_HEALS,
        skillId: "monk.shield-guardian",
      },
    ],
  }),
  // "For 4...10 seconds, enchantments cast on target other ally cost 10
  // less Energy (minimum 1 Energy)" (#1975).
  "air-of-enchantment": define("air-of-enchantment", "Air of Enchantment", "enchantment", {
    profession: "monk",
    enchantmentsOnBearerCostLess: 10,
  }),
  // "For 5...20 seconds, while you are casting spells, foes cannot target
  // you with spells. When Spell Shield ends, all your skills are disabled
  // for 8...4 seconds" (#2189), by its Divine Favor.
  "spell-shield": define("spell-shield", "Spell Shield", "enchantment", {
    profession: "monk",
    untargetableByFoeSpells: true,
    whileCasting: true,
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "disable-own-skills",
            which: "all",
            seconds: {
              scaling: { attributeId: "monk.divine-favor", atZero: 8, atTwelve: 4.8 },
            },
          },
        ],
        target: "bearer",
        skillId: "monk.spell-shield",
      },
    ],
  }),
  // "That ally gains +10 armor for each Necromancer hex that was removed"
  // (#2189): one stack a hex.
  "convert-hexes": define("convert-hexes", "Convert Hexes", "skill-effect", {
    profession: "monk",
    armorModifier: 10,
  }),
  // Protection staples (#2187). "For 8 seconds, the next time target ally
  // would take damage, the source of that damage takes that much damage
  // instead, maximum 5...75", by the caster's Smiting Prayers.
  "reversal-of-damage": define("reversal-of-damage", "Reversal of Damage", "enchantment", {
    profession: "monk",
    reflectsNextDamage: {
      cap: { scaling: { attributeId: "monk.smiting-prayers", atZero: 5, atTwelve: 61 } },
      skillId: "monk.reversal-of-damage",
    },
  }),
  // "...target other ally loses a hex every 5 seconds": the first after 5.
  "spotless-mind": define("spotless-mind", "Spotless Mind", "enchantment", {
    profession: "monk",
    pulse: {
      everySeconds: 5,
      effects: [{ kind: "remove-status", category: "hex", count: 1 }],
      skillId: "monk.spotless-mind",
    },
  }),
  // "...target other ally loses a condition every 3 seconds".
  "spotless-soul": define("spotless-soul", "Spotless Soul", "enchantment", {
    profession: "monk",
    pulse: {
      everySeconds: 3,
      effects: [{ kind: "remove-status", category: "condition", count: 1 }],
      skillId: "monk.spotless-soul",
    },
  }),
  // "For 10 seconds, whenever target ally would take damage, that ally is
  // healed for that amount instead, maximum 6...49...60", by Protection Prayers.
  "mark-of-protection": define("mark-of-protection", "Mark of Protection", "enchantment", {
    profession: "monk",
    damageToHealing: {
      cap: { scaling: { attributeId: "monk.protection-prayers", atZero: 6, atTwelve: 49 } },
    },
  }),
  // "...cannot lose more than 5% max Health due to damage from a single
  // attack or spell. When Protective Bond prevents damage, you lose
  // 6...4...3 Energy or the spell ends", by the caster's Protection Prayers.
  "protective-bond": define("protective-bond", "Protective Bond", "enchantment", {
    profession: "monk",
    maxDamageFractionPerHit: 0.05,
    casterEnergyPerReduction: {
      scaling: { attributeId: "monk.protection-prayers", atZero: 6, atTwelve: 3.6 },
    },
  }),
  // "...damage received by target ally is reduced by 5 each time that ally
  // is hit" (#2190): by 5 more on each, 5, 10, 15 ..., until it ends or is
  // recast (GW1 wiki notes).
  "shield-of-absorption": define("shield-of-absorption", "Shield of Absorption", "enchantment", {
    profession: "monk",
    damageReductionPerHitTaken: 5,
  }),
  // "...the next time target ally receives damage that would be fatal, the
  // damage is negated and that ally is healed for 26...240 Health" (#2190):
  // 197, from the Monk's Divine Favor. A blow that leaves the ally alive
  // does not spend it.
  "divine-intervention": define("divine-intervention", "Divine Intervention", "enchantment", {
    profession: "monk",
    negatesFatalDamage: true,
    triggers: [
      {
        on: "bearer-fatal-damage-negated",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "monk.divine-favor", atZero: 26, atTwelve: 197.2 } },
          },
        ],
        target: "bearer",
        skillId: "monk.divine-intervention",
      },
    ],
  }),
  // "...whenever target ally takes damage, that ally is healed for 5...35
  // Health" (#2190): 29, from the Monk's Healing Prayers, for damage a foe
  // deals, as Spirit Bond's.
  "healing-hands": define("healing-hands", "Healing Hands", "enchantment", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "monk.healing-prayers", atZero: 5, atTwelve: 29 } },
          },
        ],
        target: "bearer",
        skillId: "monk.healing-hands",
      },
    ],
  }),
  // "...anyone striking target ally with an attack is knocked down and
  // suffers 5...50 holy damage" (#2190): 41, from the Monk's Smiting
  // Prayers, on every attack that hits, whoever's.
  "shield-of-judgment": define("shield-of-judgment", "Shield of Judgment", "enchantment", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-hit-by-attack",
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "monk.smiting-prayers", atZero: 5, atTwelve: 41 },
            },
            type: "holy",
            armorPenetration: 0,
          },
          { kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS },
        ],
        target: "source-on-offender",
        skillId: "monk.shield-of-judgment",
      },
    ],
  }),
  // "...whenever you use a skill that targets an ally, all foes adjacent
  // to that target are struck for 5...35 fire damage and you lose 1
  // Energy" (#2282): a skill on itself too; the Energy goes with no foe near.
  "zealots-fire": define("zealots-fire", "Zealot's Fire", "enchantment", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-uses-skill",
        usedSkill: { targets: "ally" },
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "monk.smiting-prayers", atZero: 5, atTwelve: 29 },
                },
                type: "fire",
                armorPenetration: 0,
              },
            ],
          },
        ],
        target: "skill-target",
        skillId: "monk.zealots-fire",
      },
      {
        on: "bearer-uses-skill",
        usedSkill: { targets: "ally" },
        effects: [{ kind: "energy-loss", amount: { flat: 1 } }],
        target: "source",
        skillId: "monk.zealots-fire",
      },
    ],
  }),
  // "...whenever target ally takes physical or elemental damage, you gain
  // 1 Energy" (#2286): once a packet, a foe's; holy, shadow, chaos, dark,
  // typeless and a life steal give none.
  "essence-bond": define("essence-bond", "Essence Bond", "enchantment", {
    profession: "monk",
    triggers: (["physical", "elemental"] as const).map((damageType) => ({
      on: "bearer-takes-damage-from-foe" as const,
      damageType,
      effects: [{ kind: "energy-gain" as const, amount: { flat: 1 } }],
      target: "source" as const,
      skillId: "monk.essence-bond",
    })),
  }),
  // "...damage dealt to target other ally is reduced by 20...50%. If your
  // Health is below 50% when that ally takes damage, Life Barrier ends"
  // (#2286): the Monk's Health, read as the packet lands; that packet is
  // still reduced.
  "life-barrier": define("life-barrier", "Life Barrier", "enchantment", {
    profession: "monk",
    damageTakenMultiplier: {
      scaling: { attributeId: "monk.protection-prayers", atZero: 0.8, atTwelve: 0.56 },
    },
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        effects: [
          {
            kind: "if",
            condition: { kind: "caster-health-below", fraction: 0.5 },
            effects: [
              {
                kind: "remove-status",
                category: "enchantment",
                count: 1,
                statusId: "life-barrier",
              },
            ],
          },
        ],
        target: "bearer",
        skillId: "monk.life-barrier",
      },
    ],
  }),
  // "...whenever target ally takes attack damage, this spell deals 33% of
  // the damage back to the source (maximum 5...20 damage)" (#2286): every
  // attack while maintained, its cap by the Monk's Smiting Prayers.
  retribution: define("retribution", "Retribution", "enchantment", {
    profession: "monk",
    reflectsAttackDamage: {
      share: 0.33,
      max: { scaling: { attributeId: "monk.smiting-prayers", atZero: 5, atTwelve: 17 } },
      type: "holy",
      times: undefined,
      skillId: "monk.retribution",
    },
  }),
  // "For 30 seconds, every time target foe is healed, the healer takes
  // 15...80 holy damage" (#2286): healed by a skill, as Soul Bind's; a
  // healer on the Monk's own team takes none.
  "scourge-healing": define("scourge-healing", "Scourge Healing", "hex", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-healed-by-skill",
        effects: [
          {
            kind: "damage",
            amount: { scaling: { attributeId: "monk.smiting-prayers", atZero: 15, atTwelve: 67 } },
            type: "holy",
            armorPenetration: 0,
          },
        ],
        target: "healer",
        skillId: "monk.scourge-healing",
      },
    ],
  }),
  // "...whenever target other ally takes damage, that ally and all
  // adjacent allies gain 3...30 Health" (#2286): damage a foe deals, as
  // Healing Hands'.
  "healing-seed": define("healing-seed", "Healing Seed", "enchantment", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        effects: [
          HEALING_SEED_HEAL,
          {
            kind: "splash",
            hits: "allies",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [HEALING_SEED_HEAL],
          },
        ],
        target: "bearer",
        skillId: "monk.healing-seed",
      },
    ],
  }),
  // "...target other ally gains +1 Health and +1 Energy regeneration, but
  // you lose 1 Energy each time that ally casts a spell" (#2286).
  succor: define("succor", "Succor", "enchantment", {
    profession: "monk",
    healthPips: 1,
    energyPips: 1,
    triggers: [
      {
        on: "bearer-casts-spell",
        effects: [{ kind: "energy-loss", amount: { flat: 1 } }],
        target: "source",
        skillId: "monk.succor",
      },
    ],
  }),
  // "...whenever you cast a Protection Prayer or Divine Favor spell that
  // targets an ally, that ally is healed for 15...60 Health, and you lose
  // 1 Energy" (#2286): on itself too, as Zealot's Fire's.
  "divine-boon": define("divine-boon", "Divine Boon", "enchantment", {
    profession: "monk",
    triggers: (["monk.protection-prayers", "monk.divine-favor"] as const).flatMap((attributeId) => [
      {
        on: "bearer-casts-spell" as const,
        usedSkill: { attributes: { attributeId }, targets: "ally" as const },
        effects: [
          {
            kind: "heal" as const,
            amount: { scaling: { attributeId: "monk.divine-favor", atZero: 15, atTwelve: 51 } },
          },
        ],
        target: "skill-target" as const,
        skillId: "monk.divine-boon",
      },
      {
        on: "bearer-casts-spell" as const,
        usedSkill: { attributes: { attributeId }, targets: "ally" as const },
        effects: [{ kind: "energy-loss" as const, amount: { flat: 1 } }],
        target: "source" as const,
        skillId: "monk.divine-boon",
      },
    ]),
  }),
  // "For 8...18 seconds, target ally has +10 Health regeneration. This
  // enchantment ends if that ally attacks or uses a skill" (#2286).
  "restful-breeze": define("restful-breeze", "Restful Breeze", "enchantment", {
    profession: "monk",
    healthPips: 10,
    endsWhenBearerAttacks: true,
    endsWhenBearerUsesSkill: true,
  }),
  // Maintained (#2291): "whenever target other ally takes damage from an
  // attack, half the damage is redirected to you. The damage you receive
  // this way is reduced by 3...30", by the caster's Protection Prayers.
  "life-bond": define("life-bond", "Life Bond", "enchantment", {
    profession: "monk",
    redirectsDamage: {
      share: 0.5,
      from: "attack",
      reduction: { scaling: { attributeId: "monk.protection-prayers", atZero: 3, atTwelve: 24.6 } },
    },
  }),
  // Maintained (#2291): "target ally deals 30% less damage with attacks,
  // but gains 14...50% more Health when healed": the weapon roll, as
  // Flurry's; an attack skill's bonus is not scaled.
  "life-attunement": define("life-attunement", "Life Attunement", "enchantment", {
    profession: "monk",
    weaponDamageMultiplier: 0.7,
    healingMultiplier: {
      scaling: { attributeId: "monk.protection-prayers", atZero: 1.14, atTwelve: 1.428 },
    },
  }),
  // "For 3 seconds, target ally gains 50...100% more Health when healed
  // and takes 5...50% less damage" (#2291), by Protection Prayers.
  "aura-of-faith": define("aura-of-faith", "Aura of Faith", "enchantment", {
    profession: "monk",
    healingMultiplier: {
      scaling: { attributeId: "monk.protection-prayers", atZero: 1.5, atTwelve: 1.9 },
    },
    damageTakenMultiplier: {
      scaling: { attributeId: "monk.protection-prayers", atZero: 0.95, atTwelve: 0.59 },
    },
  }),
  // PvP (#2291): "for 1...3 seconds, conditions and hexes expire 90%
  // faster on that ally"; the duration is the skill's.
  "peace-and-harmony": define("peace-and-harmony", "Peace and Harmony", "enchantment", {
    profession: "monk",
    conditionsExpireFaster: 0.9,
    hexesExpireFaster: 0.9,
  }),
  // "For 30 seconds, that party member deals 25% more damage. When this
  // enchantment ends, target party member dies. Deaths while under the
  // effects of this enchantment do not incur a death penalty" (#2311).
  vengeance: define("vengeance", "Vengeance", "enchantment", {
    profession: "monk",
    damageDealtMultiplier: 1.25,
    killsBearerOnEnd: true,
    noDeathPenalty: true,
  }),
  // Maintained (#2302): "target ally gains adrenaline and 1 Energy when
  // taking damage", 2...5 points to each of its adrenaline skills by the
  // caster's Smiting Prayers (4.4 at 12); a bar with none, the Energy.
  "balthazars-spirit": define("balthazars-spirit", "Balthazar's Spirit", "enchantment", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        effects: [
          {
            kind: "adrenaline-gain",
            units: { scaling: { attributeId: "monk.smiting-prayers", atZero: 2, atTwelve: 4.4 } },
            recipient: "target",
          },
          { kind: "energy-gain", amount: { flat: 1 }, toTarget: true },
        ],
        target: "bearer",
        skillId: "monk.balthazars-spirit",
      },
    ],
  }),
  // "While you maintain this enchantment, target ally deals 1...5 more
  // damage in melee" (PvP, #2367): a bow gets nothing.
  "strength-of-honor": define("strength-of-honor", "Strength of Honor", "enchantment", {
    profession: "monk",
    attackDamageDelta: {
      scaling: { attributeId: "monk.smiting-prayers", atZero: 1, atTwelve: 4.2 },
    },
    attackDamageDeltaWeapon: "melee",
  }),
  // Mechanics (#2374). "...+1...4 Health regeneration. If this skill ends
  // prematurely, that ally gains 30...120 Health": 3 pips and 102 at the
  // caster's rank 12. Running its full 10 s heals nothing.
  "watchful-healing": define("watchful-healing", "Watchful Healing", "enchantment", {
    profession: "monk",
    healthPips: { scaling: { attributeId: "monk.divine-favor", atZero: 1, atTwelve: 3.4 } },
    triggers: [
      {
        on: "ends-early",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "monk.divine-favor", atZero: 30, atTwelve: 102 } },
          },
        ],
        target: "bearer",
        skillId: "monk.watchful-healing",
      },
    ],
  }),
  // Staples (#2414). "For 10...30 seconds, whenever target foe hits with
  // an attack, you gain 2 Energy": any hit, melee or ranged, to the Monk.
  "defenders-zeal": define("defenders-zeal", "Defender's Zeal", "hex", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-hits",
        effects: [{ kind: "energy-gain", amount: { flat: 2 } }],
        target: "source",
        skillId: "monk.defenders-zeal",
      },
    ],
  }),
};
