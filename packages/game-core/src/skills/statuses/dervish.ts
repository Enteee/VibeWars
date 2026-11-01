import { AREA_ADJACENT, AREA_EARSHOT, AREA_NEARBY } from "../../distances.js";
import type { StatusDefinition } from "../status.js";
import { define, ownSkills } from "./define.js";

export type DervishStatusId =
  | "extend-enchantments"
  // Dervish enchantments and stances (#845).
  | "mystic-regeneration"
  | "fleeting-stability"
  | "heart-of-fury"
  | "vow-of-strength"
  | "sand-shards"
  | "pious-haste"
  | "pious-haste-run"
  // Dervish earth enchantments (#1021).
  | "staggering-force"
  | "dust-cloak"
  | "aura-of-thorns"
  | "enchanted-haste"
  | "heart-of-holy-flame"
  | "balthazars-rage"
  | "harriers-haste"
  // Dervish forms (#1437).
  | "avatar-of-melandru"
  | "avatar-of-dwayna"
  | "avatar-of-balthazar"
  | "avatar-of-grenth"
  | "avatar-of-lyssa"
  // Dervish staples (#1551).
  | "grenths-grasp"
  | "rending-aura"
  // Dervish staples 2 (#1604).
  | "pious-fury"
  | "zealous-renewal"
  | "mirage-cloak"
  | "vital-boon"
  | "guiding-hands"
  // Dervish staples 3 (#1667).
  | "onslaught"
  | "zealous-vow"
  | "featherfoot-grace"
  | "whirling-charge"
  | "watchful-intervention"
  | "faithful-intervention"
  // "N for each X" (#1760).
  | "arcane-zeal"
  | "mystic-vigor";

export const DERVISH_STATUSES: Readonly<Record<DervishStatusId, StatusDefinition>> = {
  // "For 5...17...20 seconds, you have 1...3...4 Health regeneration for
  // each Enchantment (maximum of 3) on you."
  "mystic-regeneration": define("mystic-regeneration", "Mystic Regeneration", "enchantment", {
    profession: "dervish",
    healthPipsPerEnchantment: { pips: 3, max: 3 },
  }),
  // "You cannot be knocked down and move 25% faster. This enchantment
  // ends prematurely if it prevents a knockdown."
  "fleeting-stability": define("fleeting-stability", "Fleeting Stability", "enchantment", {
    profession: "dervish",
    moveSpeedMultiplier: 1.25,
    preventsKnockdown: true,
    endsOnKnockdownPrevented: true,
  }),
  // "You attack 25% faster": GW1 counts faster as 1 − x (ADR-0029).
  "heart-of-fury": define("heart-of-fury", "Heart of Fury", "stance", {
    profession: "dervish",
    attackDurationMultiplier: 0.75,
  }),
  // "For 15 seconds, whenever you attack a foe with your scythe, you deal
  // 10...22...25 slashing damage to all adjacent foes": 22, its rank-12
  // value. Hit, miss or block: an attack. Its own Dervish is the splash's
  // centre, so the foe it attacks is among them (#939).
  "vow-of-strength": define("vow-of-strength", "Vow of Strength", "enchantment", {
    profession: "dervish",
    triggers: [
      {
        on: "bearer-attacks",
        target: "bearer",
        effects: [
          {
            kind: "if",
            condition: { kind: "caster-wields", weapon: "scythe" },
            effects: [
              {
                kind: "splash",
                hits: "foes",
                radius: AREA_ADJACENT,
                maxTargets: undefined,
                effects: [
                  { kind: "damage", amount: { flat: 22 }, type: "slashing", armorPenetration: 0 },
                ],
              },
            ],
          },
        ],
        skillId: "dervish.vow-of-strength",
      },
    ],
  }),
  // "For 30 seconds, the next 1...4...5 times you hit with a scythe, all
  // other adjacent foes take 10...50...60 earth damage": 4 and 50, its
  // rank-12 values. Adjacent to the foe hit, not to the Dervish: at melee
  // reach the two barely differ (#939).
  "sand-shards": define("sand-shards", "Sand Shards", "enchantment", {
    profession: "dervish",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [
        {
          kind: "if",
          condition: { kind: "caster-wields", weapon: "scythe" },
          effects: [
            {
              kind: "splash",
              hits: "foes",
              radius: AREA_ADJACENT,
              maxTargets: undefined,
              effects: [
                { kind: "damage", amount: { flat: 50 }, type: "earth", armorPenetration: 0 },
              ],
            },
          ],
        },
      ],
      skillId: "dervish.sand-shards",
    },
    endsAfterHits: { count: 4, weapon: "scythe" },
  }),
  // "...for 1...6...7 [seconds] you move 25% faster. If an enchantment was
  // removed, you run 50% faster instead" (#939): two stances, so the
  // faster replaces the slower as it lands.
  "pious-haste": define("pious-haste", "Pious Haste", "stance", {
    profession: "dervish",
    moveSpeedMultiplier: 1.25,
  }),
  "pious-haste-run": define("pious-haste-run", "Pious Haste (run)", "stance", {
    profession: "dervish",
    moveSpeedMultiplier: 1.5,
  }),
  // "For 30 seconds, your attacks deal earth damage. When this enchantment
  // ends, all nearby foes have Cracked Armor for 1...8...10 seconds" (#1021):
  // 8 s, its rank-12 value. Any end counts: expiry, a strip, a death.
  "staggering-force": define("staggering-force", "Staggering Force", "enchantment", {
    profession: "dervish",
    attackDamageType: "earth",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "cracked-armor", durationSeconds: 8 }],
          },
        ],
        skillId: "dervish.staggering-force",
      },
    ],
  }),
  // "For 30 seconds, your attacks deal earth damage. When this Enchantment
  // ends, all nearby foes are Blinded for 1...3...4 seconds" (#1021): 3 s.
  "dust-cloak": define("dust-cloak", "Dust Cloak", "enchantment", {
    profession: "dervish",
    attackDamageType: "earth",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "blind", durationSeconds: 3 }],
          },
        ],
        skillId: "dervish.dust-cloak",
      },
    ],
  }),
  // "For 30 seconds, this enchantment does nothing. When this enchantment
  // ends, all nearby foes are Crippled for 3...7...8 seconds" (#1021): 7 s.
  // Until then it counts as a Dervish enchantment, nothing more.
  "aura-of-thorns": define("aura-of-thorns", "Aura of Thorns", "enchantment", {
    profession: "dervish",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 7 }],
          },
        ],
        skillId: "dervish.aura-of-thorns",
      },
    ],
  }),
  // "For 7 seconds, you move 25% faster. If this enchantment ends
  // prematurely, you lose 1 conditions" (#1421): stripped, or cut short
  // any other way, but not run out.
  "enchanted-haste": define("enchanted-haste", "Enchanted Haste", "enchantment", {
    profession: "dervish",
    moveSpeedMultiplier: 1.25,
    triggers: [
      {
        on: "ends-early",
        target: "bearer",
        effects: [{ kind: "remove-status", category: "condition", count: 1 }],
        skillId: "dervish.enchanted-haste",
      },
    ],
  }),
  // "For 30 seconds afterward, your attacks deal holy damage. When this
  // enchantment ends, all nearby foes are set on fire for 2...5 seconds"
  // (#1421): 4 s, its rank-12 value. Dust Cloak's pattern.
  "heart-of-holy-flame": define("heart-of-holy-flame", "Heart of Holy Flame", "enchantment", {
    profession: "dervish",
    attackDamageType: "holy",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: 4 }],
          },
        ],
        skillId: "dervish.heart-of-holy-flame",
      },
    ],
  }),
  // "For 20 seconds afterward, this enchantment does nothing. When this
  // enchantment ends, you gain 1...2 strikes of adrenaline if any foes are
  // within earshot" (#1421): 2, its rank-12 value. A splash that reaches
  // one foe is the "if any": the gain is the caster's, once.
  "balthazars-rage": define("balthazars-rage", "Balthazar's Rage", "enchantment", {
    profession: "dervish",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_EARSHOT,
            maxTargets: 1,
            effects: [{ kind: "adrenaline-gain", strikes: 2 }],
          },
        ],
        skillId: "dervish.balthazars-rage",
      },
    ],
  }),
  // "You move 25% faster and deal +3...12 more damage against moving foes"
  // (#1421): 10, its rank-12 value, on each hit that lands on a foe moving,
  // as a second packet beside the blow's, slashing as a scythe's.
  "harriers-haste": define("harriers-haste", "Harrier's Haste", "enchantment", {
    profession: "dervish",
    moveSpeedMultiplier: 1.25,
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [
        {
          kind: "if",
          condition: { kind: "target-moving" },
          effects: [
            { kind: "damage", amount: { flat: 10 }, type: "slashing", armorPenetration: 0 },
          ],
        },
      ],
      skillId: "dervish.harriers-haste",
    },
  }),
  // "You have +100 Health, +30 elemental armor, and your attacks deal earth
  // damage. Whenever you lose a Dervish enchantment you lose 2 conditions"
  // (#1437, PvP).
  "avatar-of-melandru": define("avatar-of-melandru", "Avatar of Melandru", "form", {
    profession: "dervish",
    maxHealthBonus: 100,
    conditionalArmor: [{ amount: 30, conditions: [{ kind: "vs-elemental" }] }],
    attackDamageType: "earth",
    triggers: [
      {
        on: "bearer-loses-enchantment",
        profession: "dervish",
        target: "bearer",
        effects: [{ kind: "remove-status", category: "condition", count: 2 }],
        skillId: "dervish.avatar-of-melandru",
      },
    ],
  }),
  // "Your attacks deal holy damage. Whenever you use a Dervish attack skill,
  // you lose 1 hex. Whenever you lose a Dervish enchantment, you are healed
  // for 5...50 Health" (#1437, PvP).
  "avatar-of-dwayna": define("avatar-of-dwayna", "Avatar of Dwayna", "form", {
    profession: "dervish",
    attackDamageType: "holy",
    triggers: [
      {
        on: "bearer-uses-skill",
        usedSkill: { type: "attack", profession: "dervish" },
        target: "bearer",
        effects: [{ kind: "remove-status", category: "hex", count: 1 }],
        skillId: "dervish.avatar-of-dwayna",
      },
      {
        on: "bearer-loses-enchantment",
        profession: "dervish",
        target: "bearer",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "dervish.mysticism", atZero: 5, atTwelve: 41 } },
          },
        ],
        skillId: "dervish.avatar-of-dwayna",
      },
    ],
  }),
  // "You gain +20 armor against physical damage, you gain adrenaline 25%
  // faster, your attacks deal holy damage, and whenever you lose a Dervish
  // enchantment, nearby foes are set on fire for 1...3...3 second[s]"
  // (#1455): 3 s, its rank-12 value.
  "avatar-of-balthazar": define("avatar-of-balthazar", "Avatar of Balthazar", "form", {
    profession: "dervish",
    conditionalArmor: [{ amount: 20, conditions: [{ kind: "vs-physical" }] }],
    adrenalineGainFaster: 0.25,
    attackDamageType: "holy",
    triggers: [
      {
        on: "bearer-loses-enchantment",
        profession: "dervish",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: 3 }],
          },
        ],
        skillId: "dervish.avatar-of-balthazar",
      },
    ],
  }),
  // "Your scythe attacks deal dark damage, and steal 0...10...12 Health.
  // You are immune to Disease, and inflict Disease on all adjacent foes
  // for 3 seconds whenever you lose a Dervish enchantment" (#1455): 10,
  // its rank-12 value.
  "avatar-of-grenth": define("avatar-of-grenth", "Avatar of Grenth", "form", {
    profession: "dervish",
    immuneTo: ["disease"],
    attackDamageType: "dark",
    attackDamageTypeWeapon: "scythe",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [
        {
          kind: "if",
          condition: { kind: "caster-wields", weapon: "scythe" },
          effects: [
            {
              kind: "life-steal",
              amount: { scaling: { attributeId: "dervish.mysticism", atZero: 0, atTwelve: 10 } },
            },
          ],
        },
      ],
      skillId: "dervish.avatar-of-grenth",
    },
    triggers: [
      {
        on: "bearer-loses-enchantment",
        profession: "dervish",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "disease", durationSeconds: 3 }],
          },
        ],
        skillId: "dervish.avatar-of-grenth",
      },
    ],
  }),
  // "Your Dervish enchantments recharge 50% faster and your attacks deal
  // chaos damage. Whenever you lose a Dervish enchantment, steal 1 Energy
  // from all nearby foes" (#1455).
  "avatar-of-lyssa": define("avatar-of-lyssa", "Avatar of Lyssa", "form", {
    profession: "dervish",
    enchantmentRechargeFaster: { share: 0.5, profession: "dervish" },
    attackDamageType: "chaos",
    triggers: [
      {
        on: "bearer-loses-enchantment",
        profession: "dervish",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "energy-steal", amount: { flat: 1 } }],
          },
        ],
        skillId: "dervish.avatar-of-lyssa",
      },
    ],
  }),
  // Dervish staples (#1551), at their rank-12 values.
  // "For 20 seconds, your attack skills also Cripple that foe for 1...11
  // seconds and you transfer 1...3 conditions from yourself to that
  // foe": 9 s and 3, on each foe an attack skill hits.
  "grenths-grasp": define("grenths-grasp", "Grenth's Grasp", "enchantment", {
    profession: "dervish",
    onAttackHit: {
      attackSkillsOnly: true,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [
        { kind: "apply-status", statusId: "crippled", durationSeconds: 9 },
        { kind: "transfer-conditions", from: "caster", count: 3, durationMultiplier: 1 },
      ],
      skillId: "dervish.grenths-grasp",
    },
  }),
  // "For 30 seconds, your attack skills remove enchantments from
  // knocked-down foes. When this enchantment ends, nearby foes are
  // affected by Cracked Armor for 1...10 seconds": one enchantment a
  // blow, and 8 s however it ends.
  "rending-aura": define("rending-aura", "Rending Aura", "enchantment", {
    profession: "dervish",
    onAttackHit: {
      attackSkillsOnly: true,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [
        {
          kind: "if",
          condition: { kind: "target-knocked-down" },
          effects: [{ kind: "remove-status", category: "enchantment", count: 1 }],
        },
      ],
      skillId: "dervish.rending-aura",
    },
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "cracked-armor", durationSeconds: 8 }],
          },
        ],
        skillId: "dervish.rending-aura",
      },
    ],
  }),
  // "For 1...5 seconds, you attack 25% faster" (#1604), as Heart of Fury;
  // the skill doubles its time.
  "pious-fury": define("pious-fury", "Pious Fury", "stance", {
    profession: "dervish",
    attackDurationMultiplier: 0.75,
  }),
  // "You have -1 Energy regeneration and gain 1 Energy whenever you hit a
  // foe. If this enchantment ends prematurely, you gain 1...5 Energy"
  // (#1604): 4, its rank-12 value. Each victim a cleave hits is a hit.
  "zealous-renewal": define("zealous-renewal", "Zealous Renewal", "enchantment", {
    profession: "dervish",
    energyPips: -1,
    triggers: [
      {
        on: "bearer-hits",
        effects: [{ kind: "energy-gain", amount: { flat: 1 } }],
        target: "bearer",
        skillId: "dervish.zealous-renewal",
      },
      {
        on: "ends-early",
        effects: [{ kind: "energy-gain", amount: { flat: 4 } }],
        target: "bearer",
        skillId: "dervish.zealous-renewal",
      },
    ],
  }),
  // "You have a 30...60% chance to block incoming attacks" (#1604): 54%,
  // its rank-12 value.
  "mirage-cloak": define("mirage-cloak", "Mirage Cloak", "enchantment", {
    profession: "dervish",
    block: { chance: 0.54, against: "all" },
  }),
  // "You have +40...100 maximum Health. When this enchantment ends, you are
  // healed for 75...200 Health" (#1604): 88 and 175, the rank-12 values,
  // as Generous Was Tsungrai's.
  "vital-boon": define("vital-boon", "Vital Boon", "enchantment", {
    profession: "dervish",
    maxHealthBonus: 88,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "heal", amount: { flat: 175 } }],
        target: "bearer",
        skillId: "dervish.vital-boon",
      },
    ],
  }),
  // "Your next 0...3 attacks cannot be blocked" (#1604): 2, its rank-12
  // value.
  "guiding-hands": define("guiding-hands", "Guiding Hands", "enchantment", {
    profession: "dervish",
    unblockableAttacks: 2,
  }),
  // "You attack and gain adrenaline 25% faster" (#1667): GW1 counts
  // faster as 1 − x (ADR-0029). PvP: no movement bonus.
  onslaught: define("onslaught", "Onslaught", "enchantment", {
    profession: "dervish",
    attackDurationMultiplier: 0.75,
    adrenalineGainFaster: 0.25,
  }),
  // "You have -3 Energy regeneration, and you gain 1...5...6 Energy every
  // time you hit with an attack" (#1667): 5, its rank-12 value, on any
  // hit, a plain swing's too, as Zealous Renewal's.
  "zealous-vow": define("zealous-vow", "Zealous Vow", "enchantment", {
    profession: "dervish",
    energyPips: -3,
    triggers: [
      {
        on: "bearer-hits",
        effects: [{ kind: "energy-gain", amount: { flat: 5 } }],
        target: "bearer",
        skillId: "dervish.zealous-vow",
      },
    ],
  }),
  // "You move 25% faster, and conditions expire 50% faster" (#1667).
  "featherfoot-grace": define("featherfoot-grace", "Featherfoot Grace", "enchantment", {
    profession: "dervish",
    moveSpeedMultiplier: 1.25,
    conditionsExpireFaster: 0.5,
  }),
  // "You move 33% faster than normal. The next time you strike a foe, all
  // other nearby foes take 10...50 cold damage and this enchantment ends"
  // (#1667): 42, the PvP rank-12 value. Nearby the foe struck, which the
  // splash spares.
  "whirling-charge": define("whirling-charge", "Whirling Charge", "enchantment", {
    profession: "dervish",
    moveSpeedMultiplier: 1.33,
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [
        {
          kind: "splash",
          hits: "foes",
          radius: AREA_NEARBY,
          maxTargets: undefined,
          effects: [{ kind: "damage", amount: { flat: 42 }, type: "cold", armorPenetration: 0 }],
        },
      ],
      skillId: "dervish.whirling-charge",
    },
    endsAfterHits: { count: 1, weapon: undefined },
  }),
  // "...the next time damage drops target ally's Health below 25%, that
  // ally is healed for 50...200 Health" (#1789).
  "watchful-intervention": define("watchful-intervention", "Watchful Intervention", "enchantment", {
    profession: "dervish",
    endsWhenTriggered: true,
    triggers: [
      {
        on: "bearer-health-drops-below",
        healthBelow: 0.25,
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "dervish.mysticism", atZero: 50, atTwelve: 170 } },
          },
        ],
        target: "bearer",
        skillId: "dervish.watchful-intervention",
      },
    ],
  }),
  // "If damage drops your Health below 50%, Faithful Intervention ends.
  // When Faithful Intervention ends, you are healed for 30...150 Health"
  // (#1789): any end, a strip too.
  "faithful-intervention": define("faithful-intervention", "Faithful Intervention", "enchantment", {
    profession: "dervish",
    endsWhenTriggered: true,
    triggers: [
      {
        on: "bearer-health-drops-below",
        healthBelow: 0.5,
        effects: [],
        target: "bearer",
        skillId: "dervish.faithful-intervention",
      },
      {
        on: "ends",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "dervish.mysticism", atZero: 30, atTwelve: 126 } },
          },
        ],
        target: "bearer",
        skillId: "dervish.faithful-intervention",
      },
    ],
  }),

  // "Your next Dervish enchantment lasts 10...122...150% longer" (#1761),
  // at rank 12: the first one used spends it.
  "extend-enchantments": define("extend-enchantments", "Extend Enchantments", "skill-effect", {
    profession: "dervish",
    ownSkillModifiers: [
      ownSkills(
        { type: "enchantment", profession: "dervish" },
        { durationMultiplier: 2.22, uses: 1 },
      ),
    ],
  }),
  // "Whenever you cast a spell, you gain 2 Energy for each enchantment on
  // you (maximum 2...7 Energy)" (#1760): 6, its rank-12 cap. It counts
  // itself.
  "arcane-zeal": define("arcane-zeal", "Arcane Zeal", "enchantment", {
    profession: "dervish",
    triggers: [
      {
        on: "bearer-casts-spell",
        effects: [
          {
            kind: "energy-gain",
            amount: { flat: 0 },
            per: {
              count: { kind: "statuses", on: "caster", categories: ["enchantment"] },
              amount: { flat: 2 },
              max: { flat: 6 },
            },
          },
        ],
        target: "bearer",
        skillId: "dervish.arcane-zeal",
      },
    ],
  }),
  // "Every time you successfully hit with an attack, you gain 3...15
  // Health for each enchantment on you (maximum 25 Health)" (#1760): 13,
  // its rank-12 value. It counts itself.
  "mystic-vigor": define("mystic-vigor", "Mystic Vigor", "enchantment", {
    profession: "dervish",
    triggers: [
      {
        on: "bearer-hits",
        effects: [
          {
            kind: "heal",
            amount: { flat: 0 },
            per: {
              count: { kind: "statuses", on: "caster", categories: ["enchantment"] },
              amount: { flat: 13 },
              max: { flat: 25 },
            },
          },
        ],
        target: "bearer",
        skillId: "dervish.mystic-vigor",
      },
    ],
  }),
};
