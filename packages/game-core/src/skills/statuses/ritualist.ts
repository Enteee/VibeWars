import { AREA_ADJACENT, AREA_EARSHOT, AREA_IN_THE_AREA, AREA_NEARBY } from "../../distances.js";
import type { StatusDefinition } from "../status.js";
import { KNOCKDOWN_SECONDS } from "../types.js";
import { define } from "./define.js";

export type RitualistStatusId =
  | "weapon-of-warding"
  // Ritualist weapon spells (#975).
  | "spirit-light-weapon"
  | "weapon-of-quickening"
  | "weapon-of-aggression"
  // Ritualist weapon spells 2 (#1022).
  | "weapon-of-remedy"
  | "vengeful-weapon"
  | "splinter-weapon"
  | "recuperation"
  // Ritualist protective spirits' auras (#1265).
  | "shelter"
  | "union"
  | "displacement"
  | "earthbind"
  // Ritualist Channeling (#1270).
  | "painful-bond"
  | "lamentation"
  // Ritualist Spawning Power creation staples (#1316).
  | "boon-of-creation"
  | "explosive-growth"
  | "spirits-gift"
  // Ritualist item spells (#1434).
  | "protective-was-kaolai"
  | "generous-was-tsungrai"
  | "defiant-was-xinrae"
  | "blind-was-mingson"
  | "grasping-was-kuurong"
  | "energetic-was-lee-sa"
  // Ritualist item spells 2 (#1464).
  | "mighty-was-vorizun"
  | "cruel-was-daoshen"
  | "destructive-was-glaive"
  | "tranquil-was-tanasen"
  | "vengeful-was-khanhei"
  | "pure-was-li-ming"
  // Ritualist spirits (#1550).
  | "soothing"
  | "xinraes-weapon"
  // Ritualist weapon spells 3 (#1654).
  | "resilient-weapon"
  | "ghostly-weapon"
  | "guided-weapon"
  | "sundering-weapon"
  | "weapon-of-shadow"
  | "warmongers-weapon"
  | "wailing-weapon"
  | "nightmare-weapon"
  | "weapon-of-fury"
  | "weapon-of-renewal"
  // Your spirits within earshot (#1777).
  | "spiritleech-aura"
  // The PvP Communing pair (#1827).
  | "armor-of-unfeeling"
  | "signet-of-ghostly-might"
  // Caster staples 2 (#1872).
  | "vital-weapon"
  // Suppressed while enchanted (#1916).
  | "brutal-weapon"
  // Attributes raised (#1941).
  | "ritual-lord";

export const RITUALIST_STATUSES: Readonly<Record<RitualistStatusId, StatusDefinition>> = {
  // "Non-Spirit allies within its range gain +1...3...3 Health
  // regeneration": the rank-12 3, as statuses carry fixed numbers.
  recuperation: define("recuperation", "Recuperation", "skill-effect", {
    profession: "ritualist",
    healthPips: 3,
  }),
  // The protective spirits (#1265), each paying for what it does with its
  // own health, at rank 12. "Non-spirit allies within its range cannot
  // lose more than 10% maximum Health from a single attack. When this
  // spirit prevents damage, it loses 75...45 Health."
  shelter: define("shelter", "Shelter", "skill-effect", {
    profession: "ritualist",
    attackDamageCapFraction: 0.1,
    sourceLosesHealth: 51,
  }),
  // "Whenever a non-spirit ally in its range takes damage or life steal,
  // it is reduced by 15 and the spirit takes 15 damage."
  union: define("union", "Union", "skill-effect", {
    profession: "ritualist",
    damageReduction: 15,
    lifeStealReduction: 15,
    sourceLosesHealth: 15,
  }),
  // "All non-spirit allies within its range have a 75% chance to block
  // incoming attacks. Every time an attack is blocked in this way, this
  // spirit takes 60 damage."
  displacement: define("displacement", "Displacement", "skill-effect", {
    profession: "ritualist",
    block: { chance: 0.75, against: "all" },
    sourceLosesHealth: 60,
  }),
  // "All non-spirit foes knocked down within its range are knocked down
  // for at least 3 seconds. Whenever this happens, this spirit loses
  // 50...25 Health."
  earthbind: define("earthbind", "Earthbind", "skill-effect", {
    profession: "ritualist",
    knockdownMinSeconds: 3,
    sourceLosesHealth: 30,
  }),
  // "+2...4...4 Health regeneration and a 50% chance to block. Weapon of
  // Warding ends if that ally attacks."
  "weapon-of-warding": define("weapon-of-warding", "Weapon of Warding", "weapon-spell", {
    profession: "ritualist",
    healthPips: 4,
    block: { chance: 0.5, against: "all" },
    endsWhenBearerAttacks: true,
  }),
  // "Target ally gains 5...21...25 Health per second and an additional
  // 5...21...25 Health per second if that ally is within earshot of a
  // Spirit" (#1064): any team's spirit.
  "spirit-light-weapon": define("spirit-light-weapon", "Spirit Light Weapon", "weapon-spell", {
    profession: "ritualist",
    healthPerSecond: 21,
    healthPerSecondNearSpirit: 21,
  }),
  // "Spells and Binding Rituals recharge 33% faster" (#1064).
  "weapon-of-quickening": define("weapon-of-quickening", "Weapon of Quickening", "weapon-spell", {
    profession: "ritualist",
    spellRechargeFaster: 0.33,
    bindingRitualRechargeFaster: 0.33,
  }),
  // "You attack 25% faster": Heart of Fury's speed-up, as a weapon spell.
  "weapon-of-aggression": define("weapon-of-aggression", "Weapon of Aggression", "weapon-spell", {
    profession: "ritualist",
    attackDurationMultiplier: 0.75,
  }),
  // "For 8 seconds, the next time target ally takes damage or life steal
  // from a foe, that ally steals up to 20...68...80 health from that foe
  // and loses 2 conditions" (#1022): 68, its rank-12 value, as for every
  // trigger (#935).
  "weapon-of-remedy": define("weapon-of-remedy", "Weapon of Remedy", "weapon-spell", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        target: "offender",
        effects: [
          { kind: "life-steal", amount: { flat: 68 } },
          { kind: "remove-status", category: "condition", count: 2, from: "caster" },
        ],
        skillId: "ritualist.weapon-of-remedy",
      },
    ],
    endsWhenTriggered: true,
  }),
  // "For 8 seconds, the next time target ally takes damage or life steal
  // from a foe, that ally steals up to 15...51...60 Health from that foe"
  // (#1022): 51.
  "vengeful-weapon": define("vengeful-weapon", "Vengeful Weapon", "weapon-spell", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        target: "offender",
        effects: [{ kind: "life-steal", amount: { flat: 51 } }],
        skillId: "ritualist.vengeful-weapon",
      },
    ],
    endsWhenTriggered: true,
  }),
  // "For 20 seconds, target ally's next 1...4...5 attacks deal 5...25...30
  // damage to up to 4 adjacent foes" (#1022): 4 and 25, its rank-12
  // values. Adjacent to the foe hit, that foe excluded, as Sand Shards
  // (#939). GW1's is armor-ignoring physical; typeless ignores armor here.
  "splinter-weapon": define("splinter-weapon", "Splinter Weapon", "weapon-spell", {
    profession: "ritualist",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [
        {
          kind: "splash",
          hits: "foes",
          radius: AREA_ADJACENT,
          maxTargets: undefined,
          effects: [
            { kind: "damage", amount: { flat: 25 }, type: "typeless", armorPenetration: 0 },
          ],
        },
      ],
      skillId: "ritualist.splinter-weapon",
    },
    endsAfterHits: { count: 4, weapon: undefined },
  }),
  // "...take 8...18...20 damage whenever hit by a spirit's attack" (#1270):
  // 18, its rank-12 value.
  "painful-bond": define("painful-bond", "Painful Bond", "hex", {
    profession: "ritualist",
    damageFromSpiritAttacks: 18,
  }),
  // "...suffer -0...2...3 Health degeneration" (#1270): 2, its rank-12 value.
  lamentation: define("lamentation", "Lamentation", "hex", {
    profession: "ritualist",
    healthPips: -2,
  }),
  // "Whenever you create a creature, you gain 5...50 Health and 1...6
  // Energy" (#1316): scaled by the Ritualist's own Spawning Power.
  "boon-of-creation": define("boon-of-creation", "Boon of Creation", "enchantment", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-creates-creature",
        target: "bearer",
        effects: [
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "ritualist.spawning-power", atZero: 5, atTwelve: 41 },
            },
          },
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "ritualist.spawning-power", atZero: 1, atTwelve: 5 },
            },
          },
        ],
        skillId: "ritualist.boon-of-creation",
      },
    ],
  }),
  // "Whenever you create a creature, up to 5 foes near that creature are
  // struck for 20...65 lightning damage" (#1316).
  "explosive-growth": define("explosive-growth", "Explosive Growth", "enchantment", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-creates-creature",
        target: "created",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: 5,
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "ritualist.spawning-power", atZero: 20, atTwelve: 56 },
                },
                type: "lightning",
                armorPenetration: 0,
              },
            ],
          },
        ],
        skillId: "ritualist.explosive-growth",
      },
    ],
  }),
  // "Whenever you create a creature, all allies near that creature gain
  // 5...50 Health and lose 1 condition" (#1316).
  "spirits-gift": define("spirits-gift", "Spirit's Gift", "enchantment", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-creates-creature",
        target: "created",
        effects: [
          {
            kind: "splash",
            hits: "allies",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [
              {
                kind: "heal",
                amount: {
                  scaling: { attributeId: "ritualist.spawning-power", atZero: 5, atTwelve: 41 },
                },
              },
              { kind: "remove-status", category: "condition", count: 1 },
            ],
          },
        ],
        skillId: "ritualist.spirits-gift",
      },
    ],
  }),

  // Ritualist item spells (#1434): a bonus while the ashes are held, and a
  // drop effect, their `ends` trigger, wherever the holder is when they
  // fall. Rank-12 values, by their Ritualist.
  // "...you gain 20 armor. When you drop his ashes, all party members are
  // healed for 20...95 Health": 80.
  "protective-was-kaolai": define("protective-was-kaolai", "Protective Was Kaolai", "item", {
    profession: "ritualist",
    armorModifier: 20,
    triggers: [
      {
        on: "ends",
        effects: [
          { kind: "heal", amount: { flat: 80 } },
          {
            kind: "splash",
            hits: "party",
            radius: Number.POSITIVE_INFINITY,
            maxTargets: undefined,
            effects: [{ kind: "heal", amount: { flat: 80 } }],
          },
        ],
        target: "bearer",
        skillId: "ritualist.protective-was-kaolai",
      },
    ],
  }),
  // "...gain +50...140 maximum Health. When you drop his ashes, you gain
  // 100...280 Health": 122 and 244. Health above the maximum left goes
  // with the bonus, before the drop heals.
  "generous-was-tsungrai": define("generous-was-tsungrai", "Generous Was Tsungrai", "item", {
    profession: "ritualist",
    maxHealthBonus: 122,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "heal", amount: { flat: 244 } }],
        target: "bearer",
        skillId: "ritualist.generous-was-tsungrai",
      },
    ],
  }),
  // "...you cannot lose more than 20% of your max Health from a single
  // hit. When you drop her ashes, you steal 5...50 Health from all nearby
  // foes": 41.
  "defiant-was-xinrae": define("defiant-was-xinrae", "Defiant Was Xinrae", "item", {
    profession: "ritualist",
    maxDamageFractionPerHit: 0.2,
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "life-steal", amount: { flat: 41 } }],
          },
        ],
        target: "bearer",
        skillId: "ritualist.defiant-was-xinrae",
      },
    ],
  }),
  // "When you drop his ashes, all nearby foes are Blinded for 3...8
  // seconds": 7. Nothing while held.
  "blind-was-mingson": define("blind-was-mingson", "Blind Was Mingson", "item", {
    profession: "ritualist",
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "blind", durationSeconds: 7 }],
          },
        ],
        target: "bearer",
        skillId: "ritualist.blind-was-mingson",
      },
    ],
  }),
  // "When you drop his ashes, all foes in the area are struck for 15...75
  // damage and knocked down": 63, typeless. Nothing while held.
  "grasping-was-kuurong": define("grasping-was-kuurong", "Grasping Was Kuurong", "item", {
    profession: "ritualist",
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_IN_THE_AREA,
            maxTargets: undefined,
            effects: [
              { kind: "damage", amount: { flat: 63 }, type: "typeless", armorPenetration: 0 },
              { kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS },
            ],
          },
        ],
        target: "bearer",
        skillId: "ritualist.grasping-was-kuurong",
      },
    ],
  }),
  // "...you gain +2 Energy regeneration. When you drop her ashes, you gain
  // +1...10 Energy": 8.
  "energetic-was-lee-sa": define("energetic-was-lee-sa", "Energetic Was Lee Sa", "item", {
    profession: "ritualist",
    energyPips: 2,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "energy-gain", amount: { flat: 8 } }],
        target: "bearer",
        skillId: "ritualist.energetic-was-lee-sa",
      },
    ],
  }),
  // Ritualist item spells 2 (#1464), rank-12 values as #1434's.
  // "...you gain +15 armor and +30 maximum Energy." Nothing on the drop.
  "mighty-was-vorizun": define("mighty-was-vorizun", "Mighty Was Vorizun", "item", {
    profession: "ritualist",
    armorModifier: 15,
    maxEnergyBonus: 30,
  }),
  // "...all Ritualist skills have 10% armor penetration. When you drop his
  // ashes, all nearby foes are struck for 15...85 lightning damage": 71,
  // without the spell's 25%, as the text names none.
  "cruel-was-daoshen": define("cruel-was-daoshen", "Cruel Was Daoshen", "item", {
    profession: "ritualist",
    skillArmorPenetration: { share: 0.1, profession: "ritualist" },
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [
              { kind: "damage", amount: { flat: 71 }, type: "lightning", armorPenetration: 0 },
            ],
          },
        ],
        target: "bearer",
        skillId: "ritualist.cruel-was-daoshen",
      },
    ],
  }),
  // As Cruel Was Daoshen (PvP), but all foes in the area: 71.
  "destructive-was-glaive": define("destructive-was-glaive", "Destructive Was Glaive", "item", {
    profession: "ritualist",
    skillArmorPenetration: { share: 0.1, profession: "ritualist" },
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_IN_THE_AREA,
            maxTargets: undefined,
            effects: [
              { kind: "damage", amount: { flat: 71 }, type: "lightning", armorPenetration: 0 },
            ],
          },
        ],
        target: "bearer",
        skillId: "ritualist.destructive-was-glaive",
      },
    ],
  }),
  // "...you have +10...25 armor and cannot be interrupted": 22.
  "tranquil-was-tanasen": define("tranquil-was-tanasen", "Tranquil Was Tanasen", "item", {
    profession: "ritualist",
    armorModifier: 22,
    uninterruptible: true,
  }),
  // "Whenever a foe strikes you in combat... you steal 10...45 Health from
  // that foe": 38.
  "vengeful-was-khanhei": define("vengeful-was-khanhei", "Vengeful Was Khanhei", "item", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-hit-by-attack",
        target: "offender",
        effects: [{ kind: "life-steal", amount: { flat: 38 } }],
        skillId: "ritualist.vengeful-was-khanhei",
      },
    ],
  }),
  // "...conditions on you expire 10...50% faster. When you drop her ashes,
  // all allies within earshot lose 1...4 conditions": 42% and 3.
  "pure-was-li-ming": define("pure-was-li-ming", "Pure Was Li Ming", "item", {
    profession: "ritualist",
    conditionsExpireFaster: 0.42,
    triggers: [
      {
        on: "ends",
        effects: [
          { kind: "remove-status", category: "condition", count: 3 },
          {
            kind: "splash",
            hits: "allies",
            radius: AREA_EARSHOT,
            maxTargets: undefined,
            effects: [{ kind: "remove-status", category: "condition", count: 3 }],
          },
        ],
        target: "bearer",
        skillId: "ritualist.pure-was-li-ming",
      },
    ],
  }),
  // Soothing's aura (#1550): "All foes within its range take twice as
  // long to build adrenaline".
  soothing: define("soothing", "Soothing", "skill-effect", {
    profession: "ritualist",
    adrenalineGainFaster: -0.5,
  }),
  // "For 8 seconds, the next time target ally takes damage from a foe that
  // damage is limited to 5% of that ally's max Health and that ally steals
  // up to 20...80 Health from that foe" (#1550): 68, its rank-12 value.
  "xinraes-weapon": define("xinraes-weapon", "Xinrae's Weapon", "weapon-spell", {
    profession: "ritualist",
    maxDamageFractionPerHit: 0.05,
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        target: "offender",
        effects: [{ kind: "life-steal", amount: { flat: 68 } }],
        skillId: "ritualist.xinraes-weapon",
      },
    ],
    endsWhenTriggered: true,
  }),
  // Ritualist weapon spells 3 (#1654), rank-12 values.
  // "While suffering from a hex or condition, that ally gains +1...6
  // Health regeneration and +24 armor": 5.
  "resilient-weapon": define("resilient-weapon", "Resilient Weapon", "weapon-spell", {
    profession: "ritualist",
    whileUnder: {
      categories: ["condition", "hex"],
      statusIds: [],
      attackDurationMultiplier: 1,
      adrenalineGainFaster: 0,
      healthPips: 5,
      armorModifier: 24,
      attackMissChance: 0,
    },
  }),
  // "...target other ally's next attack cannot be blocked": Guiding
  // Hands' single attack, hit or miss.
  "ghostly-weapon": define("ghostly-weapon", "Ghostly Weapon", "weapon-spell", {
    profession: "ritualist",
    unblockableAttacks: 1,
  }),
  // "...target ally's attacks cannot be blocked": every one, nothing spent.
  "guided-weapon": define("guided-weapon", "Guided Weapon", "weapon-spell", {
    profession: "ritualist",
    attacksUnblockable: true,
  }),
  // "...next 3 attacks have 10% armor penetration and cause Cracked Armor
  // for 5...20 seconds": 17. Three hits, not swings: a miss spends none.
  "sundering-weapon": define("sundering-weapon", "Sundering Weapon", "weapon-spell", {
    profession: "ritualist",
    attackArmorPenetration: 0.1,
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [{ kind: "apply-status", statusId: "cracked-armor", durationSeconds: 17 }],
      skillId: "ritualist.sundering-weapon",
    },
    endsAfterHits: { count: 3, weapon: undefined },
  }),
  // "Whenever that ally is struck by an attack, that ally's attacker
  // becomes Blinded for 5 seconds. The next 1...3 times that ally hits
  // with an attack, his target is Blinded for 5 seconds": every hit for
  // its 6 s, not only the next 3, a simplification.
  "weapon-of-shadow": define("weapon-of-shadow", "Weapon of Shadow", "weapon-spell", {
    profession: "ritualist",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [{ kind: "apply-status", statusId: "blind", durationSeconds: 5 }],
      skillId: "ritualist.weapon-of-shadow",
    },
    triggers: [
      {
        on: "bearer-hit-by-attack",
        target: "offender",
        effects: [{ kind: "apply-status", statusId: "blind", durationSeconds: 5 }],
        skillId: "ritualist.weapon-of-shadow",
      },
    ],
  }),
  // "...if target ally attacks a foe who is not attacking, that foe is
  // interrupted."
  "warmongers-weapon": define("warmongers-weapon", "Warmonger's Weapon", "weapon-spell", {
    profession: "ritualist",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [
        {
          kind: "if",
          condition: { kind: "target-not-attacking" },
          effects: [{ kind: "interrupt" }],
        },
      ],
      skillId: "ritualist.warmongers-weapon",
    },
  }),
  // "Whenever the Wailing Weapon strikes an attacking foe, that foe is
  // interrupted": an attack skill being used, or a plain swing under way
  // (#1709).
  "wailing-weapon": define("wailing-weapon", "Wailing Weapon", "weapon-spell", {
    profession: "ritualist",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [
        { kind: "if", condition: { kind: "target-attacking" }, effects: [{ kind: "interrupt" }] },
      ],
      skillId: "ritualist.wailing-weapon",
    },
  }),
  // "...next 3 attacks are reduced by 10...50 damage and steal up to
  // 10...50 Health": 42. Three hits, not swings: a miss spends none.
  "nightmare-weapon": define("nightmare-weapon", "Nightmare Weapon", "weapon-spell", {
    profession: "ritualist",
    attackDamageDelta: -42,
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [{ kind: "life-steal", amount: { flat: 42 } }],
      skillId: "ritualist.nightmare-weapon",
    },
    endsAfterHits: { count: 3, weapon: undefined },
  }),
  // "...target ally gains 100% more adrenaline and 1 Energy whenever that
  // ally successfully hits with an attack."
  "weapon-of-fury": define("weapon-of-fury", "Weapon of Fury", "weapon-spell", {
    profession: "ritualist",
    adrenalineGainFaster: 1,
    triggers: [
      {
        on: "bearer-hits",
        effects: [{ kind: "energy-gain", amount: { flat: 1 } }],
        target: "bearer",
        skillId: "ritualist.weapon-of-fury",
      },
    ],
  }),
  // "...the next time target ally hits with an attack skill, that ally
  // gains 1...7 Energy": 6. A plain swing neither gives nor spends it.
  "weapon-of-renewal": define("weapon-of-renewal", "Weapon of Renewal", "weapon-spell", {
    profession: "ritualist",
    onAttackHit: {
      attackSkillsOnly: true,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [{ kind: "energy-gain", amount: { flat: 6 } }],
      skillId: "ritualist.weapon-of-renewal",
    },
    endsWhenBearerHitsWithAttackSkill: true,
  }),
  // On a spirit (#1777): "...deal 5...20 less damage and steal 5...20
  // Health when they attack": 17 each. The steal lands on a hit however
  // little the blow dealt, and heals the spirit.
  "spiritleech-aura": define("spiritleech-aura", "Spiritleech Aura", "skill-effect", {
    profession: "ritualist",
    attackDamageDelta: -17,
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      weaponDamage: undefined,
      effects: [{ kind: "life-steal", amount: { flat: 17 } }],
      skillId: "ritualist.spiritleech-aura",
    },
  }),
  // PvP (#1827): "you have 10 base damage reduction while casting binding
  // rituals". Off each packet, and only mid-activation.
  "armor-of-unfeeling": define("armor-of-unfeeling", "Armor of Unfeeling", "enchantment", {
    profession: "ritualist",
    damageReductionWhileCasting: { skillType: "binding-ritual", amount: 10 },
  }),
  // PvP (#1827): "Target allied summoned creature's attacks deal 5...35
  // more damage. After 10 seconds, that creature is destroyed": +29, its
  // rank-12 value. A removal before its time destroys nothing.
  "signet-of-ghostly-might": define(
    "signet-of-ghostly-might",
    "Signet of Ghostly Might",
    "skill-effect",
    {
      profession: "ritualist",
      attackDamageDelta: 29,
      destroysBearerOnExpiry: true,
    },
  ),
  // "Target ally has a Vital Weapon and has +40...175 maximum Health"
  // (#1872): 148 at rank 12.
  "vital-weapon": define("vital-weapon", "Vital Weapon", "weapon-spell", {
    profession: "ritualist",
    maxHealthBonus: 148,
  }),
  // "The bearer's weapon strikes for +5...13...15 damage as long as the
  // bearer is under no enchantments" (#1916): another weapon spell is no
  // enchantment, so it never stops itself.
  "brutal-weapon": define("brutal-weapon", "Brutal Weapon", "weapon-spell", {
    profession: "ritualist",
    attackDamageDelta: 13,
    suppressedWhileUnder: ["enchantment"],
  }),
  // "For 5...29...35 seconds, your Ritualist attributes are boosted by
  // 2...4 for your next skill. If that skill is a binding ritual, it
  // recharges 10...50...60% faster and Ritual Lord recharges instantly"
  // (#1941): rank 12. Any other skill spends it to no effect.
  "ritual-lord": define("ritual-lord", "Ritual Lord", "skill-effect", {
    profession: "ritualist",
    attributeDeltas: [{ scope: { profession: "ritualist" }, amount: 4 }],
    nextSkillRule: {
      which: "any",
      uninterruptible: false,
      unblockable: false,
      energyDiscount: 0,
      castsInstantly: false,
      extraRechargeSeconds: 0,
      rechargesInstantly: false,
      losesAllEnergy: false,
      rechargeFasterIfType: { type: "binding-ritual", fraction: 0.5 },
      resetsOwnRechargeIfType: "binding-ritual",
      skillId: "ritualist.ritual-lord",
    },
  }),
};
