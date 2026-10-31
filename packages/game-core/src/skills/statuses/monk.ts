import type { StatusDefinition } from "../status.js";
import type { HealEffect } from "../types.js";
import { define } from "./define.js";

export type MonkStatusId =
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
  | "watchful-spirit";

/**
 * Vigorous Spirit's heal, each time its bearer attacks or casts a spell:
 * scaled by its caster's Healing Prayers, as the trigger's caster is the
 * status's source.
 */
const VIGOROUS_SPIRIT_HEAL: HealEffect = {
  kind: "heal",
  amount: { scaling: { attributeId: "monk.healing-prayers", atZero: 5, atTwelve: 17 } },
  perStatusOnTarget: [],
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
            perStatusOnTarget: [],
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
  // gains 15...30 armor": +27, its rank-12 value (#1511).
  "shield-of-deflection": define("shield-of-deflection", "Shield of Deflection", "enchantment", {
    profession: "monk",
    block: { chance: 0.75, against: "all" },
    armorModifier: 27,
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
        effects: [{ kind: "heal", amount: { flat: 41 }, perStatusOnTarget: [] }],
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
  // Monk staples 6 (#1748), at their rank-12 values.
  // "...whenever target ally hits a foe, you gain 2...17 Health": 14, by
  // its caster's Healing Prayers.
  "live-vicariously": define("live-vicariously", "Live Vicariously", "enchantment", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-hits",
        effects: [
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "monk.healing-prayers", atZero: 2, atTwelve: 14 },
            },
            perStatusOnTarget: [],
          },
        ],
        target: "source",
        skillId: "monk.live-vicariously",
      },
    ],
  }),
  // "...conditions expire 5...50% faster on target ally. When this
  // enchantment ends, one condition is removed from that ally": 41%.
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
  // damage." Only damage or life steal from a foe of the bearer's ends it:
  // degeneration does in GW1, not here.
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
  // 30...180 Health when Watchful Spirit ends": 150, by its caster's
  // Divine Favor, on any end.
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
            perStatusOnTarget: [],
          },
        ],
        target: "bearer",
        skillId: "monk.watchful-spirit",
      },
    ],
  }),
};
