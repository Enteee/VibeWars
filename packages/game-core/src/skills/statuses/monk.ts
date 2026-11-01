import { AREA_ADJACENT, AREA_EARSHOT } from "../../distances.js";
import type { StatusDefinition } from "../status.js";
import type { HealEffect, SkillEffect } from "../types.js";
import { define, ownSkills } from "./define.js";

export type MonkStatusId =
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
  | "air-of-enchantment";

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
  // 15...67...80": 67, its rank-12 cap; the 8 s are the skill's.
  "reversal-of-fortune": define("reversal-of-fortune", "Reversal of Fortune", "enchantment", {
    profession: "monk",
    reversesNextDamage: 67,
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
  // 10...30...35% longer." One maintained has no duration to lengthen.
  "blessed-aura": define("blessed-aura", "Blessed Aura", "enchantment", {
    profession: "monk",
    ownSkillModifiers: [
      ownSkills({ type: "enchantment", profession: "monk" }, { durationMultiplier: 1.3 }),
    ],
  }),
  // "Your Healing Prayers spells heal for 20% less Health, but cost
  // 1...3...4 less Energy." The 20% is the Divine Favor bonus's too.
  "healers-covenant": define("healers-covenant", "Healer's Covenant", "enchantment", {
    profession: "monk",
    ownSkillModifiers: [
      ownSkills(
        { type: "spell", attributeId: "monk.healing-prayers" },
        { energyDiscount: 3, healMultiplier: 0.8 },
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
};
