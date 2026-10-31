import type { StatusDefinition } from "../status.js";
import { AREA_ADJACENT } from "../../distances.js";
import { define } from "./define.js";

export type RangerStatusId =
  | "regeneration"
  | "natural-stride"
  | "lightning-reflexes"
  | "escape"
  // Ranger staples (#1539).
  | "whirling-defense"
  | "serpents-quickness"
  | "dodge"
  | "zojuns-haste"
  // Preparations.
  | "apply-poison"
  // Ranger staples 2 (#1629).
  | "kindle-arrows"
  | "ignite-arrows"
  // Spirits' auras (#1064), worn while in a spirit's range.
  | "winnowing"
  // Ranger calls and bonds on a pet (#1108).
  | "call-of-haste"
  | "call-of-protection"
  | "symbiotic-bond"
  // Infuriating Heat (#1540).
  | "infuriating-heat"
  // Ranger staples 4 (#1742).
  | "seeking-arrows"
  | "barbed-arrows"
  | "barbed-arrows-armor"
  | "melandrus-arrows"
  | "read-the-wind"
  // Nature rituals 1 (#1745).
  | "fertile-season"
  | "quickening-zephyr"
  | "frozen-soil"
  | "muddy-terrain"
  | "conflagration"
  | "predatory-season"
  | "winter";

export const RANGER_STATUSES: Readonly<Record<RangerStatusId, StatusDefinition>> = {
  // Troll Unguent's (a ranger skill), though it is an enchantment here.
  regeneration: define("regeneration", "Regeneration", "enchantment", {
    profession: "ranger",
    healthPips: 4,
  }),
  // "For 1...7...8 seconds, you run 33% faster and have a 50% chance to
  // block incoming attacks. Natural Stride ends if you become Hexed or
  // Enchanted."
  "natural-stride": define("natural-stride", "Natural Stride", "stance", {
    profession: "ranger",
    moveSpeedMultiplier: 1.33,
    block: { chance: 0.5, against: "all" },
    endsWhenBearerGains: ["hex", "enchantment"],
  }),
  // "For 5...10...11 seconds, you have a 75% chance to block melee and
  // projectile attacks, and you attack 33% faster" (#976).
  "lightning-reflexes": define("lightning-reflexes", "Lightning Reflexes", "stance", {
    profession: "ranger",
    block: { chance: 0.75, against: "all" },
    attackDurationMultiplier: 0.67,
  }),
  // "For 1...7...8 seconds, you move 33% faster and have a 75% chance to
  // block attacks. Escape ends if you make a melee attack." (#976, PvP)
  escape: define("escape", "Escape", "stance", {
    profession: "ranger",
    moveSpeedMultiplier: 1.33,
    block: { chance: 0.75, against: "all" },
    endsWhenBearerAttacksInMelee: true,
  }),
  // "For 8...20 seconds, you have 75% chance to block attacks. Whenever
  // you block a projectile in this way, adjacent foes take 5...11 damage"
  // (#1539): 10, its rank-12 value. The splash centres on the bearer, so
  // a far archer takes none.
  "whirling-defense": define("whirling-defense", "Whirling Defense", "stance", {
    profession: "ranger",
    block: { chance: 0.75, against: "all" },
    triggers: [
      {
        on: "bearer-blocks-projectile",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [
              { kind: "damage", type: "typeless", armorPenetration: 0, amount: { flat: 10 } },
            ],
          },
        ],
        skillId: "ranger.whirling-defense",
      },
    ],
  }),
  // "For 15...30 seconds, recharge times for your skills are reduced by
  // 33%. Serpent's Quickness ends if your Health drops below 50%" (#1539):
  // read when a foe damages the bearer, so Bleeding or a sacrifice below
  // half ends it only at the next foe's damage. Stances replace each
  // other, so the one stance removed is this one.
  "serpents-quickness": define("serpents-quickness", "Serpent's Quickness", "stance", {
    profession: "ranger",
    skillRechargeFaster: 0.33,
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        target: "bearer",
        effects: [
          {
            kind: "if",
            condition: { kind: "target-health-below", fraction: 0.5 },
            effects: [{ kind: "remove-status", category: "stance", count: 1 }],
          },
        ],
        skillId: "ranger.serpents-quickness",
      },
    ],
  }),
  // "For 5...11 seconds, you move 33% faster and have a 27...75% chance to
  // block incoming projectiles. Dodge ends if you attack" (#1539): 65%,
  // its rank-12 value.
  dodge: define("dodge", "Dodge", "stance", {
    profession: "ranger",
    moveSpeedMultiplier: 1.33,
    block: { chance: 0.65, against: "projectile" },
    endsWhenBearerAttacks: true,
  }),
  // "For 5...11 seconds, you move 33% faster and have a 27...75% chance to
  // block incoming projectiles. Zojun's Haste ends if you attack" (#1676),
  // Dodge's twin: 65%.
  "zojuns-haste": define("zojuns-haste", "Zojun's Haste", "stance", {
    profession: "ranger",
    moveSpeedMultiplier: 1.33,
    block: { chance: 0.65, against: "projectile" },
    endsWhenBearerAttacks: true,
  }),
  // What a spirit projects on whoever is in its range (#1064): worn while
  // there, never stripped, only escaped. "Non-spirit creatures within
  // range take 4 additional damage whenever they take physical damage."
  winnowing: define("winnowing", "Winnowing", "skill-effect", {
    profession: "ranger",
    physicalDamageTakenBonus: 4,
  }),
  // Calls and a bond on a Ranger's pet (#1108), at rank 12. Call of
  // Haste: "25% faster attack speed and moves 25% faster".
  "call-of-haste": define("call-of-haste", "Call of Haste", "shout", {
    profession: "ranger",
    moveSpeedMultiplier: 1.25,
    attackDurationMultiplier: 0.75,
  }),
  // Call of Protection: "5...17...20 base damage reduction".
  "call-of-protection": define("call-of-protection", "Call of Protection", "shout", {
    profession: "ranger",
    damageReduction: 17,
  }),
  // Symbiotic Bond: "+1...3...3 health regeneration, and half of any
  // physical damage dealt to your animal companion is redirected to you".
  "symbiotic-bond": define("symbiotic-bond", "Symbiotic Bond", "shout", {
    profession: "ranger",
    healthPips: 3,
    redirectsPhysicalDamage: 0.5,
  }),

  // "Enemies struck by your physical attacks become poisoned for
  // 3...13...15 seconds": 13 s, its rank-12 value.
  "apply-poison": define("apply-poison", "Apply Poison", "preparation", {
    profession: "ranger",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      effects: [{ kind: "apply-status", statusId: "poison", durationSeconds: 13 }],
      skillId: "ranger.apply-poison",
    },
  }),
  // "For 24 seconds, your arrows deal fire damage and hit for an
  // additional 3...24 fire damage" (#1629): 20, its rank-12 value. Only a
  // bow's blows: a sword's stay physical and get nothing.
  "kindle-arrows": define("kindle-arrows", "Kindle Arrows", "preparation", {
    profession: "ranger",
    attackDamageType: "fire",
    attackDamageTypeWeapon: "bow",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: "bow",
      effects: [
        {
          kind: "damage",
          amount: { flat: 20 },
          type: "fire",
          armorPenetration: 0,
        },
      ],
      skillId: "ranger.kindle-arrows",
    },
  }),
  // "For 24 seconds, your arrows explode on contact, dealing 3...18 fire
  // damage to target and all adjacent foes" (#1629): 15, its rank-12
  // value. The splash skips its centre, so the struck foe's comes first.
  "ignite-arrows": define("ignite-arrows", "Ignite Arrows", "preparation", {
    profession: "ranger",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: "bow",
      effects: [
        { kind: "damage", amount: { flat: 15 }, type: "fire", armorPenetration: 0 },
        {
          kind: "splash",
          hits: "foes",
          radius: AREA_ADJACENT,
          maxTargets: undefined,
          effects: [{ kind: "damage", amount: { flat: 15 }, type: "fire", armorPenetration: 0 }],
        },
      ],
      skillId: "ranger.ignite-arrows",
    },
  }),
  // Infuriating Heat (#1540), at its rank-12 value.
  // The spirit's aura, PvP: "Non-spirit creatures within its range gain
  // adrenaline 33...66% as fast": 59% faster.
  "infuriating-heat": define("infuriating-heat", "Infuriating Heat", "skill-effect", {
    profession: "ranger",
    adrenalineGainFaster: 0.59,
  }),
  // Ranger staples 4 (#1742), at rank 12. "For 3...14 seconds, your
  // arrows cannot be blocked. Seeking Arrows ends if you fail to hit."
  "seeking-arrows": define("seeking-arrows", "Seeking Arrows", "preparation", {
    profession: "ranger",
    attacksUnblockable: true,
    endsWhenBearerMisses: true,
  }),
  // "For 24 seconds, your arrows cause Bleeding for 3...15 seconds": 13 s.
  "barbed-arrows": define("barbed-arrows", "Barbed Arrows", "preparation", {
    profession: "ranger",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: "bow",
      effects: [{ kind: "apply-status", statusId: "bleeding", durationSeconds: 13 }],
      skillId: "ranger.barbed-arrows",
    },
  }),
  // "You have -40 armor while activating this skill", as Healing Signet's.
  "barbed-arrows-armor": define("barbed-arrows-armor", "Barbed Arrows", "skill-effect", {
    profession: "ranger",
    armorModifier: -40,
  }),
  // "For 18 seconds, whenever your arrows hit, they cause Bleeding for
  // 3...25 seconds, and if they hit a target who is under an enchantment,
  // they do +8...28 damage": 21 s, and +24 piercing, an arrow's own type.
  "melandrus-arrows": define("melandrus-arrows", "Melandru's Arrows", "preparation", {
    profession: "ranger",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: "bow",
      effects: [
        { kind: "apply-status", statusId: "bleeding", durationSeconds: 21 },
        {
          kind: "if",
          condition: { kind: "target-has", category: "enchantment" },
          effects: [
            { kind: "damage", amount: { flat: 24 }, type: "piercing", armorPenetration: 0 },
          ],
        },
      ],
      skillId: "ranger.melandrus-arrows",
    },
  }),
  // PvP: "For 24 seconds, your arrows move twice as fast."
  "read-the-wind": define("read-the-wind", "Read the Wind", "preparation", {
    profession: "ranger",
    projectileSpeedMultiplier: 2,
  }),

  // Nature rituals 1 (#1745): each spirit's aura, at its rank-12 value.
  // Fertile Season: "Non-spirit creatures within range have +50...150
  // maximum Health and gain +8 armor": +130.
  "fertile-season": define("fertile-season", "Fertile Season", "skill-effect", {
    profession: "ranger",
    maxHealthBonus: 130,
    armorModifier: 8,
  }),
  // "All skills recharge twice as fast and cost 30% more of the base
  // Energy to cast."
  "quickening-zephyr": define("quickening-zephyr", "Quickening Zephyr", "skill-effect", {
    profession: "ranger",
    skillRechargeFaster: 0.5,
    energyCostMultiplier: 1.3,
  }),
  // "Non-spirit creatures within its range cannot activate resurrection
  // skills."
  "frozen-soil": define("frozen-soil", "Frozen Soil", "skill-effect", {
    profession: "ranger",
    preventsResurrection: true,
  }),
  // "Move 10% slower and speed boosts have no effect."
  "muddy-terrain": define("muddy-terrain", "Muddy Terrain", "skill-effect", {
    profession: "ranger",
    moveSpeedMultiplier: 0.9,
    preventsSpeedBoosts: true,
  }),
  // "All arrows that hit strike for fire damage."
  conflagration: define("conflagration", "Conflagration", "skill-effect", {
    profession: "ranger",
    attackDamageType: "fire",
    attackDamageTypeWeapon: "bow",
  }),
  // "All healing is reduced by 20%. If any of your attacks hit, you gain
  // 5 Health": the bearer's own, so it is cut by the 20% too.
  "predatory-season": define("predatory-season", "Predatory Season", "skill-effect", {
    profession: "ranger",
    healingMultiplier: 0.8,
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      effects: [{ kind: "heal", amount: { flat: 5 }, recipient: "caster" }],
      skillId: "ranger.predatory-season",
    },
  }),
  // "All elemental damage is cold damage instead."
  winter: define("winter", "Winter", "skill-effect", {
    profession: "ranger",
    elementalDamageTakenAs: "cold",
  }),
};
