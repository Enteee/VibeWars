import { AREA_ADJACENT, AREA_EARSHOT, AREA_NEARBY } from "../../distances.js";
import type { DamageType } from "../../equipment/types.js";
import type { StatusDefinition } from "../status.js";
import { KNOCKDOWN_SECONDS, type PerCount } from "../types.js";
import { define, ownSkills } from "./define.js";

export type ElementalistStatusId =
  // PvP forms (#1951).
  | "elemental-flame"
  | "mist-form"
  | "shard-storm"
  | "ice-spikes"
  | "deep-freeze"
  | "armor-boost"
  // Glyphs.
  | "glyph-of-lesser-energy"
  // Glyphs that change how the next spell goes (#1730).
  | "glyph-of-concentration"
  | "glyph-of-sacrifice"
  | "glyph-of-renewal"
  | "glyph-of-essence"
  // Wards' auras (#1087), worn while inside a ward.
  | "ward-against-melee"
  // Elementalist Water Magic staples (#1367).
  | "ice-prison"
  | "frozen-burst"
  | "ice-spear"
  | "blurred-vision"
  | "armor-of-mist"
  | "shatterstone"
  | "mind-freeze"
  // Necromancer and Elementalist staples (#1540).
  | "mark-of-rodgort"
  | "ward-against-elements"
  // Elementalist staples 2 (#1575).
  | "obsidian-flesh"
  | "ward-against-foes"
  | "ward-of-stability"
  // Elementalist energy engine (#1614).
  | "fire-attunement"
  | "water-attunement"
  | "air-attunement"
  | "earth-attunement"
  | "aura-of-restoration"
  | "kinetic-armor"
  // Elementalist staples 3 (#1664).
  | "windborne-speed"
  | "ash-blast"
  // Attribute hexes (#1765).
  | "freezing-gust"
  // Caster staples (#1870).
  | "grasping-earth"
  | "master-of-magic"
  | "glyph-of-elemental-power"
  | "glyph-of-energy"
  // Self-buffs (#1984).
  | "conjure-flame"
  | "conjure-frost"
  | "conjure-lightning"
  | "ether-prodigy"
  | "ether-renewal"
  | "elemental-attunement"
  // Elementalist auras (#2095).
  | "magnetic-aura"
  | "swirling-aura"
  | "magnetic-surge"
  | "sliver-armor"
  // Elementalist staples (#2166).
  | "teinais-prison"
  | "glimmering-mark"
  // Staples (#2278).
  | "lightning-surge"
  | "ward-against-harm"
  | "iron-mist"
  | "chilling-winds"
  // Staples (#2289).
  | "armor-of-frost"
  | "incendiary-bonds"
  | "rust"
  // Elementalist staples (#2288).
  | "gust"
  | "mirror-of-ice"
  | "winters-embrace"
  | "burning-speed"
  // Staples (#2414).
  | "flame-djinns-haste"
  | "frigid-armor"
  | "stone-sheath"
  // Staples (#2367).
  | "earthen-shackles"
  | "ether-prism"
  // Mechanics (#2438).
  | "glyph-of-restoration"
  // Mechanics (#2453).
  | "stoneflesh-aura"
  | "icy-shackles"
  | "glyph-of-swiftness"
  | "ward-of-weakness";

/** Incendiary Bonds' blast (#2289), on its bearer and the foes near it. */
const INCENDIARY_BLAST = {
  kind: "splash",
  hits: "foes",
  radius: AREA_NEARBY,
  maxTargets: undefined,
  includesCentre: true,
  effects: [
    {
      kind: "damage",
      amount: { scaling: { attributeId: "elementalist.fire-magic", atZero: 20, atTwelve: 68 } },
      type: "fire",
      armorPenetration: 0,
    },
    {
      kind: "apply-status",
      statusId: "burning",
      durationSeconds: {
        scaling: { attributeId: "elementalist.fire-magic", atZero: 1, atTwelve: 2.6 },
      },
    },
  ],
} as const;

/** Mist Form's heal (#1951): 210% of the spell's cost, under 80% Health. */
const MIST_FORM_HEAL = {
  kind: "heal",
  amount: { flat: 2.1 },
  perUsedSkillEnergy: true,
  onlyBelowHealthFraction: 0.8,
} as const;

export const ELEMENTALIST_STATUSES: Readonly<Record<ElementalistStatusId, StatusDefinition>> = {
  // "...move 66% slower for 2...5...6 seconds" (#918).
  // "...target foe and all foes adjacent to your target take 5...25 damage
  // each second. Foes using attack skills are Blinded for 3 seconds. This
  // hex ends if you use a skill that targets this foe" (#2282): lightning,
  // Air Magic's, and the Blindness flat.
  "glimmering-mark": define("glimmering-mark", "Glimmering Mark", "hex", {
    profession: "elementalist",
    attribute: "elementalist.air-magic",
    endsWhenSourceTargets: true,
    pulse: {
      everySeconds: 1,
      effects: [
        {
          kind: "splash",
          hits: "foes",
          radius: AREA_ADJACENT,
          maxTargets: undefined,
          includesCentre: true,
          effects: [
            {
              kind: "damage",
              amount: {
                scaling: { attributeId: "elementalist.air-magic", atZero: 5, atTwelve: 21 },
              },
              type: "lightning",
              armorPenetration: 0,
            },
          ],
        },
        {
          kind: "splash",
          hits: "foes",
          radius: AREA_ADJACENT,
          maxTargets: undefined,
          includesCentre: true,
          onlyUsing: "attack",
          effects: [{ kind: "apply-status", statusId: "blind", durationSeconds: { flat: 3 } }],
        },
      ],
      skillId: "elementalist.glimmering-mark",
    },
  }),
  "shard-storm": define("shard-storm", "Shard Storm", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.34,
  }),
  // "...move 66% slower for 2...5...6 seconds" (#938).
  "ice-spikes": define("ice-spikes", "Ice Spikes", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.34,
  }),
  // "...causing the foe to move 66% slower. If that foe has Cracked Armor,
  // the chill seeps through causing 5...9 Health degeneration" (#2166),
  // scaled by Water Magic (#2191).
  "teinais-prison": define("teinais-prison", "Teinai's Prison", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.34,
    whileUnder: {
      categories: [],
      statusIds: ["cracked-armor"],
      attackDurationMultiplier: 1,
      adrenalineGainFaster: 0,
      healthPips: {
        scaling: { attributeId: "elementalist.water-magic", atZero: -5, atTwelve: -8.2 },
      },
      armorModifier: 0,
      attackMissChance: 0,
    },
  }),
  // "For 10 seconds, all foes move 66% slower" (#938).
  "deep-freeze": define("deep-freeze", "Deep Freeze", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.34,
  }),
  // The slow is Armor of Earth's price: without it, +24 armor is free.
  // "For 30 seconds, you gain 24...60 armor, but move 50...14% slower"
  // (#2428), at the caster's Earth Magic.
  "armor-boost": define("armor-boost", "Armor Boost", "enchantment", {
    profession: "elementalist",
    armorModifier: {
      scaling: { attributeId: "elementalist.earth-magic", atZero: 24, atTwelve: 52.8 },
    },
    moveSpeedMultiplier: {
      scaling: { attributeId: "elementalist.earth-magic", atZero: 0.5, atTwelve: 0.788 },
    },
  }),
  // What a ward projects on the allies inside it (#1087), as a spirit's
  // aura: "non-spirit allies in this area have a 50% chance to block
  // melee attacks".
  "ward-against-melee": define("ward-against-melee", "Ward Against Melee", "skill-effect", {
    profession: "elementalist",
    block: { chance: 0.5, against: "melee" },
  }),

  // "Your next 2 spells cost 10...16...18 less Energy to cast": 16, its
  // rank-12 value; Energy Storage scaling waits for #532.
  "glyph-of-lesser-energy": define("glyph-of-lesser-energy", "Glyph of Lesser Energy", "glyph", {
    profession: "elementalist",
    nextSpells: {
      count: 2,
      costReduction: 16,
      noOvercast: false,
      rechargeFaster: 0,
      projectileSpeedMultiplier: 1,
    },
  }),
  // "For 25 seconds, your elemental attributes are boosted by 1...2 for
  // your next 10 spells" (#1941): 2, its rank-12 value. Spent as each
  // spell starts, as every glyph here; GW1 keeps it on an interrupted one.
  "glyph-of-elemental-power": define(
    "glyph-of-elemental-power",
    "Glyph of Elemental Power",
    "glyph",
    {
      profession: "elementalist",
      nextSpells: {
        count: 10,
        costReduction: 0,
        noOvercast: false,
        rechargeFaster: 0,
        projectileSpeedMultiplier: 1,
      },
      attributeDeltas: [{ scope: "elemental", amount: 2 }],
    },
  ),
  // "Your next 1...3 spells cost 10...25 less Energy, cause no Overcast,
  // and your elemental attributes are boosted by 1...2 for those spells"
  // (#1941): 3, 22 and 2 at rank 12; no duration, as Signet of Illusions.
  "glyph-of-energy": define("glyph-of-energy", "Glyph of Energy", "glyph", {
    profession: "elementalist",
    nextSpells: {
      count: 3,
      costReduction: 22,
      noOvercast: true,
      rechargeFaster: 0,
      projectileSpeedMultiplier: 1,
    },
    attributeDeltas: [{ scope: "elemental", amount: 2 }],
  }),
  // "Your next 1 spells cannot be interrupted" (#1730); "and ignore the
  // effects of being Dazed" waits for Dazed's casting to come.
  "glyph-of-concentration": define("glyph-of-concentration", "Glyph of Concentration", "glyph", {
    profession: "elementalist",
    nextSkillRule: {
      which: "spell",
      uninterruptible: true,
      unblockable: false,
      energyDiscount: 0,
      castsInstantly: false,
      extraRechargeSeconds: 0,
      rechargesInstantly: false,
      losesAllEnergy: false,
      rechargeFasterIfType: undefined,
      resetsOwnRechargeIfType: undefined,
      skillId: "elementalist.glyph-of-concentration",
    },
  }),
  // "Your next spell casts instantly, but it takes an additional 30
  // seconds to recharge. Ends prematurely if you use a non-spell skill."
  "glyph-of-sacrifice": define("glyph-of-sacrifice", "Glyph of Sacrifice", "glyph", {
    profession: "elementalist",
    nextSkillRule: {
      which: "spell",
      uninterruptible: false,
      unblockable: false,
      energyDiscount: 0,
      castsInstantly: true,
      extraRechargeSeconds: 30,
      rechargesInstantly: false,
      losesAllEnergy: false,
      rechargeFasterIfType: undefined,
      resetsOwnRechargeIfType: undefined,
      skillId: "elementalist.glyph-of-sacrifice",
    },
    endsWhenBearerUsesOtherSkill: true,
  }),
  // "Your next spell instantly recharges" (#1730).
  "glyph-of-renewal": define("glyph-of-renewal", "Glyph of Renewal", "glyph", {
    profession: "elementalist",
    nextSkillRule: {
      which: "spell",
      uninterruptible: false,
      unblockable: false,
      energyDiscount: 0,
      castsInstantly: false,
      extraRechargeSeconds: 0,
      rechargesInstantly: true,
      losesAllEnergy: false,
      rechargeFasterIfType: undefined,
      resetsOwnRechargeIfType: undefined,
      skillId: "elementalist.glyph-of-renewal",
    },
  }),
  // "Your next spell casts instantly but causes you to lose all Energy" (#1730).
  "glyph-of-essence": define("glyph-of-essence", "Glyph of Essence", "glyph", {
    profession: "elementalist",
    nextSkillRule: {
      which: "spell",
      uninterruptible: false,
      unblockable: false,
      energyDiscount: 0,
      castsInstantly: true,
      extraRechargeSeconds: 0,
      rechargesInstantly: false,
      losesAllEnergy: true,
      rechargeFasterIfType: undefined,
      resetsOwnRechargeIfType: undefined,
      skillId: "elementalist.glyph-of-essence",
    },
  }),
  // "For 8...20 seconds, target foe's legs are encased in ice, causing the
  // foe to move 66% slower" (#1367).
  "ice-prison": define("ice-prison", "Ice Prison", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.34,
  }),
  // "...and move 66% slower for 3...8 seconds" (#1367).
  "frozen-burst": define("frozen-burst", "Frozen Burst", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.34,
  }),
  // "If you are Overcast, you gain +1...4 Health regeneration for 5
  // seconds" (#1367): 3, its rank-12 value. Nothing GW1 removes: Ice Spear
  // is an enchantment by label only.
  "ice-spear": define("ice-spear", "Ice Spear", "skill-effect", {
    profession: "elementalist",
    healthPips: 3,
  }),
  // "While hexed, those foes have a 50% chance to miss with attacks" (#1367).
  "blurred-vision": define("blurred-vision", "Blurred Vision", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    attackMissChance: 0.5,
  }),
  // "...you gain +10...40 armor and move 33% faster" (#1367): +34, its
  // rank-12 value.
  "armor-of-mist": define("armor-of-mist", "Armor of Mist", "enchantment", {
    profession: "elementalist",
    armorModifier: 34,
    moveSpeedMultiplier: 1.33,
  }),
  // "...moves 66% slower, and is hexed with Shatterstone for 3 seconds.
  // When Shatterstone ends, that foe and all nearby foes are struck for
  // 25...100 cold damage" (#1367): 85, its rank-12 value, by its caster.
  // Any end, a removal included: GW1 says "ends". The splash leaves the
  // bearer out, so it is struck once.
  shatterstone: define("shatterstone", "Shatterstone", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.34,
    triggers: [
      {
        on: "ends",
        effects: [
          { kind: "damage", amount: { flat: 85 }, type: "cold", armorPenetration: 0 },
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "damage", amount: { flat: 85 }, type: "cold", armorPenetration: 0 }],
          },
        ],
        target: "bearer",
        skillId: "elementalist.shatterstone",
      },
    ],
  }),
  // "...and moves 90% slower for 1...5 seconds" (#1367).
  "mind-freeze": define("mind-freeze", "Mind Freeze", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.1,
  }),
  // Necromancer and Elementalist staples (#1540), at their rank-12 values.
  // "...whenever each foe is struck for fire damage, that foe is set on
  // fire for 1...4 seconds": 3. A life steal is no strike.
  "mark-of-rodgort": define("mark-of-rodgort", "Mark of Rodgort", "hex", {
    profession: "elementalist",
    attribute: "elementalist.fire-magic",
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        damageType: "fire",
        effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: { flat: 3 } }],
        target: "bearer",
        skillId: "elementalist.mark-of-rodgort",
      },
    ],
  }),
  // What the ward projects on the allies inside it, as Ward Against
  // Melee's: "non-spirit allies in this area gain +24 armor against
  // elemental damage".
  "ward-against-elements": define(
    "ward-against-elements",
    "Ward Against Elements",
    "skill-effect",
    {
      profession: "elementalist",
      conditionalArmor: [{ amount: 24, conditions: [{ kind: "vs-elemental" }] }],
    },
  ),
  // Elementalist staples 2 (#1575), at their rank-12 values.
  // "...you gain +20 armor and cannot be the target of enemy spells, but
  // cannot attack and have -2 energy degeneration."
  "obsidian-flesh": define("obsidian-flesh", "Obsidian Flesh", "enchantment", {
    profession: "elementalist",
    armorModifier: 20,
    untargetableByFoeSpells: true,
    preventsAttacks: true,
    energyPips: -2,
  }),
  // What the ward projects on the foes inside it: "non-spirit foes in this
  // area move 50% slower".
  "ward-against-foes": define("ward-against-foes", "Ward Against Foes", "skill-effect", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.5,
  }),
  // And on the allies inside it: "non-spirit allies cannot be knocked down".
  "ward-of-stability": define("ward-of-stability", "Ward of Stability", "skill-effect", {
    profession: "elementalist",
    preventsKnockdown: true,
  }),
  // Elementalist energy engine (#1614), at their rank-12 values.
  "fire-attunement": attunement("fire-attunement", "Fire Attunement", "fire-magic"),
  "water-attunement": attunement("water-attunement", "Water Attunement", "water-magic"),
  "air-attunement": attunement("air-attunement", "Air Attunement", "air-magic"),
  "earth-attunement": attunement("earth-attunement", "Earth Attunement", "earth-magic"),
  // PvP: "you gain 0...1 Energy and are healed for 200...400% of the Energy
  // cost each time you cast a spell": 1, and 360%.
  "aura-of-restoration": define("aura-of-restoration", "Aura of Restoration", "enchantment", {
    profession: "elementalist",
    triggers: [
      {
        on: "bearer-casts-spell",
        target: "bearer",
        effects: [
          { kind: "energy-gain", amount: { flat: 1 } },
          { kind: "heal", amount: { flat: 3.6 }, perUsedSkillEnergy: true },
        ],
        skillId: "elementalist.aura-of-restoration",
      },
    ],
  }),
  // "For 15 seconds, your next 2 spells heal you for 30...105 Health, and
  // you are healed for 150...400% of the Energy cost of each spell" (#2438),
  // at the bearer's Energy Storage, spent as each spell starts.
  "glyph-of-restoration": define("glyph-of-restoration", "Glyph of Restoration", "glyph", {
    profession: "elementalist",
    endsAfterTriggers: 2,
    triggers: [
      {
        on: "bearer-casts-spell",
        target: "bearer",
        effects: [
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "elementalist.energy-storage", atZero: 30, atTwelve: 90 },
            },
          },
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "elementalist.energy-storage", atZero: 1.5, atTwelve: 3.5 },
            },
            perUsedSkillEnergy: true,
          },
        ],
        skillId: "elementalist.glyph-of-restoration",
      },
    ],
  }),
  // "For 12 seconds, you gain +20...80 armor. Whenever you cast a spell,
  // Kinetic Armor is renewed for 12 seconds": +68.
  "kinetic-armor": define("kinetic-armor", "Kinetic Armor", "enchantment", {
    profession: "elementalist",
    armorModifier: 68,
    renewsOnBearerSpell: true,
  }),
  // Elementalist staples 3 (#1664), at their rank-12 values.
  // "For 5...13 seconds, target ally moves 33% faster."
  "windborne-speed": define("windborne-speed", "Windborne Speed", "enchantment", {
    profession: "elementalist",
    moveSpeedMultiplier: 1.33,
  }),
  // "Burning foes struck by Ash Blast are hexed for 5 seconds and have a
  // 20...75% chance to miss with attacks": 64%.
  "ash-blast": define("ash-blast", "Ash Blast", "hex", {
    profession: "elementalist",
    attribute: "elementalist.earth-magic",
    attackMissChance: 0.64,
  }),
  // "...that foe moves 66% slower for 1...5 seconds" (#1765).
  "freezing-gust": define("freezing-gust", "Freezing Gust", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.34,
  }),
  // "For 5...17...20 seconds, all nearby foes move 50% slower" (#1870).
  "grasping-earth": define("grasping-earth", "Grasping Earth", "hex", {
    profession: "elementalist",
    attribute: "elementalist.earth-magic",
    moveSpeedMultiplier: 0.5,
  }),
  // "For 1...49...61 seconds, all of your elemental attributes are set to
  // 8...13...14 and your elemental spells return 1 Energy plus 30% of
  // their Energy cost" (#1929): rank 13, at rank 12, over runes and
  // Weakness alike; the return as an attunement's.
  "master-of-magic": define("master-of-magic", "Master of Magic", "enchantment", {
    profession: "elementalist",
    attributeSet: { scope: "elemental", rank: 13, plusEquipment: false },
    triggers: (["air-magic", "earth-magic", "fire-magic", "water-magic"] as const).map(
      (attribute) => ({
        on: "bearer-uses-skill" as const,
        usedSkill: { attributes: { attributeId: `elementalist.${attribute}` } },
        target: "bearer" as const,
        effects: [
          { kind: "energy-gain" as const, amount: { flat: 1 } },
          {
            kind: "energy-gain" as const,
            amount: { flat: 0.3 },
            perUsedSkillEnergy: true as const,
          },
        ],
        skillId: "elementalist.master-of-magic",
      }),
    ),
  }),
  // PvP: "For 5...20 seconds, whenever you apply an Elemental hex to a foe,
  // that foe is set on fire for 1...2 seconds" (#1951): 2.
  "elemental-flame": define("elemental-flame", "Elemental Flame", "enchantment", {
    profession: "elementalist",
    triggers: [
      {
        on: "bearer-applies-hex",
        appliedHex: { attributes: "elemental" },
        effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: { flat: 2 } }],
        target: "hexed-foe",
        skillId: "elementalist.elemental-flame",
      },
    ],
  }),
  // PvP: "you take 33% less damage from foes under the effect of Water Magic
  // hexes. Whenever you cast an elemental spell, all non-spirit allies in
  // earshot are healed for 50...250% of the Energy cost of the spell. This
  // spell does not heal allies above 80% Health" (#1951): 210%, the bearer
  // among them.
  "mist-form": define("mist-form", "Mist Form", "enchantment", {
    profession: "elementalist",
    damageReductionFromHexedSource: { attributeId: "elementalist.water-magic", fraction: 0.33 },
    triggers: [
      {
        on: "bearer-casts-spell",
        usedSkill: { attributes: "elemental" },
        target: "bearer",
        effects: [
          MIST_FORM_HEAL,
          {
            kind: "splash",
            hits: "non-spirit-allies",
            radius: AREA_EARSHOT,
            maxTargets: undefined,
            effects: [MIST_FORM_HEAL],
          },
        ],
        skillId: "elementalist.mist-form",
      },
    ],
  }),
  // "For 60 seconds, if you're wielding a fire weapon, your attacks strike
  // for an additional 5...20 fire damage" (#1984): 17, a staff's bolt
  // included; Frost's and Lightning's the same.
  "conjure-flame": conjure("conjure-flame", "Conjure Flame", "fire"),
  "conjure-frost": conjure("conjure-frost", "Conjure Frost", "cold"),
  "conjure-lightning": conjure("conjure-lightning", "Conjure Lightning", "lightning"),
  // "For 8...20 seconds, you gain +6 Energy regeneration. When Ether
  // Prodigy ends, you lose 2 Health for each point of Energy you have"
  // (#1984): any end, a removal included; Health loss, not damage.
  "ether-prodigy": define("ether-prodigy", "Ether Prodigy", "enchantment", {
    profession: "elementalist",
    energyPips: 6,
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "lose-health",
            recipient: "target",
            amount: { flat: 0 },
            per: { count: { kind: "energy", on: "target" }, amount: { flat: 2 }, max: undefined },
          },
        ],
        skillId: "elementalist.ether-prodigy",
      },
    ],
  }),
  // PvP: "each time you cast a spell, you gain 1...3 Energy and 5...20
  // Health for each enchantment on you" (#1984): 3 and 17.
  "ether-renewal": define("ether-renewal", "Ether Renewal", "enchantment", {
    profession: "elementalist",
    triggers: [
      {
        on: "bearer-casts-spell",
        target: "bearer",
        effects: [
          { kind: "energy-gain", amount: { flat: 0 }, per: etherRenewalPer(3) },
          { kind: "heal", amount: { flat: 0 }, per: etherRenewalPer(17) },
        ],
        skillId: "elementalist.ether-renewal",
      },
    ],
  }),
  // "you are attuned to Air, Fire, Water, and Earth and gain +1...2 to
  // these attributes. You gain 1 Energy plus 50% of the base Energy cost
  // of the skill each time you use magic associated with any of these
  // elements" (#1984): +2.
  "elemental-attunement": define("elemental-attunement", "Elemental Attunement", "enchantment", {
    profession: "elementalist",
    attributeDeltas: [{ scope: "elemental", amount: 2 }],
    triggers: [
      {
        on: "bearer-uses-skill",
        usedSkill: { attributes: "elemental" },
        target: "bearer",
        effects: [
          { kind: "energy-gain", amount: { flat: 1 } },
          { kind: "energy-gain", amount: { flat: 0.5 }, perUsedSkillEnergy: true },
        ],
        skillId: "elementalist.elemental-attunement",
      },
    ],
  }),

  // "For 1...8 seconds, you block the next attack against you and deal
  // 10...50 damage to your attacker" (#2095): 42 at rank 12, from the
  // Elementalist, a party member's copy too. A block by any status ends
  // it, and it deals its damage; an unblockable attack leaves it up.
  "magnetic-aura": define("magnetic-aura", "Magnetic Aura", "enchantment", {
    profession: "elementalist",
    block: { chance: 1, against: "all" },
    endsWhenTriggered: true,
    triggers: [
      {
        on: "bearer-blocks",
        target: "source-on-offender",
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.earth-magic", atZero: 10, atTwelve: 42 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
        ],
        skillId: "elementalist.magnetic-aura",
      },
    ],
  }),
  // "...1...6 Health regeneration and a 50% chance to block projectiles"
  // (#2095): 5 pips at rank 12. Never melee.
  "swirling-aura": define("swirling-aura", "Swirling Aura", "enchantment", {
    profession: "elementalist",
    healthPips: { scaling: { attributeId: "elementalist.water-magic", atZero: 1, atTwelve: 5 } },
    block: { chance: 0.5, against: "projectile" },
  }),
  // "...enchants all allies in earshot for 1...5 seconds to block the next
  // attack against them" (#2095): an unblockable attack spends it too.
  "magnetic-surge": define("magnetic-surge", "Magnetic Surge", "enchantment", {
    profession: "elementalist",
    block: { chance: 1, against: "all" },
    endsAfterAttacks: 1,
  }),
  // "...25...50% chance to block attacks and whenever you are the target
  // of a hostile spell or attack one nearby foe is struck for 5...35 earth
  // damage" (#2095): 45% and 29 at rank 12, on the nearest foe.
  "sliver-armor": define("sliver-armor", "Sliver Armor", "enchantment", {
    profession: "elementalist",
    block: { chance: 0.45, against: "all" },
    triggers: [
      {
        on: "bearer-targeted-by-foe",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: 1,
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "elementalist.earth-magic", atZero: 5, atTwelve: 29 },
                },
                type: "earth",
                armorPenetration: 0,
              },
            ],
          },
        ],
        skillId: "elementalist.sliver-armor",
      },
    ],
  }),
  // Staples (#2278). "After 3 seconds, target foe is knocked down, struck
  // for 14...100 lightning damage, and has Cracked Armor for 5...20
  // seconds. This spell has 25% armor penetration": only its expiry
  // strikes, so a strip first does nothing. Knocked down first, as the
  // text orders; its caster's Air Magic.
  "lightning-surge": define("lightning-surge", "Lightning Surge", "hex", {
    profession: "elementalist",
    attribute: "elementalist.air-magic",
    triggers: [
      {
        on: "expires",
        target: "bearer",
        effects: [
          { kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS },
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "elementalist.air-magic", atZero: 14, atTwelve: 82.8 },
            },
            type: "lightning",
            armorPenetration: 0.25,
          },
          {
            kind: "apply-status",
            statusId: "cracked-armor",
            durationSeconds: {
              scaling: { attributeId: "elementalist.air-magic", atZero: 5, atTwelve: 17 },
            },
          },
        ],
        skillId: "elementalist.lightning-surge",
      },
    ],
  }),
  // What the ward projects on the allies inside it: "+1...3 Health
  // regeneration, +12...24 armor, and an additional +12...24 armor against
  // elemental damage", at its caster's Water Magic.
  "ward-against-harm": define("ward-against-harm", "Ward Against Harm", "skill-effect", {
    profession: "elementalist",
    healthPips: { scaling: { attributeId: "elementalist.water-magic", atZero: 1, atTwelve: 2.6 } },
    armorModifier: {
      scaling: { attributeId: "elementalist.water-magic", atZero: 12, atTwelve: 21.6 },
    },
    conditionalArmor: [
      {
        amount: {
          scaling: { attributeId: "elementalist.water-magic", atZero: 12, atTwelve: 21.6 },
        },
        conditions: [{ kind: "vs-elemental" }],
      },
    ],
  }),
  // "You have +15 armor. Your Air Magic spells that target a foe activate
  // and recharge 33% faster, but you are Overcast by 2 points" (#2311).
  "iron-mist": define("iron-mist", "Iron Mist", "enchantment", {
    profession: "elementalist",
    armorModifier: 15,
    ownSkillModifiers: [
      ownSkills(
        { type: "spell", attributeId: "elementalist.air-magic", targetsFoe: true },
        { activationMultiplier: 0.67, rechargeFaster: 0.33, overcastPerUse: 2 },
      ),
    ],
  }),
  // "For 10 seconds, the next Water Magic hex targeting a hexed foe lasts
  // 25...100% longer" (#2311), by its caster's Air Magic.
  "chilling-winds": define("chilling-winds", "Chilling Winds", "hex", {
    profession: "elementalist",
    attribute: "elementalist.air-magic",
    nextIncomingHexDurationMultiplier: {
      attributeId: "elementalist.water-magic",
      multiplier: {
        scaling: { attributeId: "elementalist.air-magic", atZero: 1.25, atTwelve: 1.85 },
      },
    },
  }),
  // Staples (#2289). "...you gain +40 armor against physical damage and
  // have +1 Water Magic": both flat.
  "armor-of-frost": define("armor-of-frost", "Armor of Frost", "enchantment", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    conditionalArmor: [{ amount: 40, conditions: [{ kind: "vs-physical" }] }],
    attributeDeltas: [{ scope: { attributeId: "elementalist.water-magic" }, amount: 1 }],
  }),
  // "After 3 seconds, target foe and all nearby foes are struck for
  // 20...80 fire damage and are set on fire for 1...3 seconds. Activates
  // early if target foe dies": its expiry or its bearer's death, never a
  // strip; its caster's Fire Magic.
  "incendiary-bonds": define("incendiary-bonds", "Incendiary Bonds", "hex", {
    profession: "elementalist",
    attribute: "elementalist.fire-magic",
    triggers: [
      {
        on: "expires",
        target: "bearer",
        effects: [INCENDIARY_BLAST],
        skillId: "elementalist.incendiary-bonds",
      },
      {
        on: "bearer-dies",
        target: "bearer",
        effects: [INCENDIARY_BLAST],
        skillId: "elementalist.incendiary-bonds",
      },
    ],
  }),
  // "...take twice as long to activate signets."
  rust: define("rust", "Rust", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    ownSkillModifiers: [ownSkills({ type: "signet" }, { activationMultiplier: 2 })],
  }),
  // "For 5...11 seconds, both you and target ally move 33% faster" (#2288).
  gust: define("gust", "Gust", "enchantment", {
    profession: "elementalist",
    attribute: "elementalist.air-magic",
    moveSpeedMultiplier: 1.33,
  }),
  // "...and move 66% slower for 2...6 seconds" (#2288).
  "mirror-of-ice": define("mirror-of-ice", "Mirror of Ice", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.34,
  }),
  // "For 3 seconds, target and all nearby foes move 90% slower. When
  // Earthen Shackles ends, it applies Weakness for 5...20 seconds"
  // (#2367). Any end, a strip included.
  "earthen-shackles": define("earthen-shackles", "Earthen Shackles", "hex", {
    profession: "elementalist",
    attribute: "elementalist.earth-magic",
    moveSpeedMultiplier: 0.1,
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "apply-status",
            statusId: "weakness",
            durationSeconds: {
              scaling: { attributeId: "elementalist.earth-magic", atZero: 5, atTwelve: 17 },
            },
          },
        ],
        skillId: "elementalist.earthen-shackles",
      },
    ],
  }),
  // "For 3 seconds, all damage you take is reduced by 75%. When Ether Prism
  // ends, you gain 5...20 Energy" (#2367). A skill effect: nothing strips it.
  "ether-prism": define("ether-prism", "Ether Prism", "skill-effect", {
    profession: "elementalist",
    damageTakenMultiplier: 0.25,
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "elementalist.energy-storage", atZero: 5, atTwelve: 17 },
            },
          },
        ],
        skillId: "elementalist.ether-prism",
      },
    ],
  }),
  // Mechanics (#2374). "...moves 66% slower and takes 5...15 damage while
  // moving": 13 at rank 12, each second it is moving as the second comes.
  "winters-embrace": define("winters-embrace", "Winter's Embrace", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.34,
    pulse: {
      everySeconds: 1,
      effects: [
        {
          kind: "if",
          condition: { kind: "target-moving" },
          effects: [
            {
              kind: "damage",
              amount: {
                scaling: { attributeId: "elementalist.water-magic", atZero: 5, atTwelve: 13 },
              },
              type: "typeless",
              armorPenetration: 0,
            },
          ],
        },
      ],
      skillId: "elementalist.winters-embrace",
    },
  }),
  // "For 7 seconds, you are set on fire and move 30...45% faster. When
  // Burning Speed ends, all adjacent foes are set on fire for 3...9
  // seconds" (#2428): both at the caster's Fire Magic.
  "burning-speed": define("burning-speed", "Burning Speed", "enchantment", {
    profession: "elementalist",
    moveSpeedMultiplier: {
      scaling: { attributeId: "elementalist.fire-magic", atZero: 1.3, atTwelve: 1.42 },
    },
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [
              {
                kind: "apply-status",
                statusId: "burning",
                durationSeconds: {
                  scaling: { attributeId: "elementalist.fire-magic", atZero: 3, atTwelve: 7.8 },
                },
              },
            ],
          },
        ],
        skillId: "elementalist.burning-speed",
      },
    ],
  }),
  // Staples (#2414). "For 8...14 seconds, you move 25% faster."
  "flame-djinns-haste": define("flame-djinns-haste", "Flame Djinn's Haste", "enchantment", {
    profession: "elementalist",
    moveSpeedMultiplier: 1.25,
  }),
  // "For 10...25 seconds, you have +10...40 armor against physical damage
  // and cannot be set on fire" (#2373): a Burning already on you runs on.
  "frigid-armor": define("frigid-armor", "Frigid Armor", "enchantment", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    conditionalArmor: [
      {
        amount: { scaling: { attributeId: "elementalist.water-magic", atZero: 10, atTwelve: 34 } },
        conditions: [{ kind: "vs-physical" }],
      },
    ],
    refuses: ["burning"],
  }),
  // "For 5...20 seconds, you and target ally have +1...30 armor and are
  // immune to critical hits" (#2373).
  "stone-sheath": define("stone-sheath", "Stone Sheath", "enchantment", {
    profession: "elementalist",
    attribute: "elementalist.earth-magic",
    armorModifier: {
      scaling: { attributeId: "elementalist.earth-magic", atZero: 1, atTwelve: 24.2 },
    },
    preventsCriticalHits: true,
  }),
  // "For 5...15 seconds, damage you receive is reduced by 1...31, and you
  // are immune to critical attacks" (#2453): 25 at rank 12, after armor.
  "stoneflesh-aura": define("stoneflesh-aura", "Stoneflesh Aura", "enchantment", {
    profession: "elementalist",
    attribute: "elementalist.earth-magic",
    damageReduction: {
      scaling: { attributeId: "elementalist.earth-magic", atZero: 1, atTwelve: 25 },
    },
    preventsCriticalHits: true,
  }),
  // "For 1...10 seconds, target foe's movement speed is reduced by 66%.
  // While under the effects of an enchantment, that foe's movement is
  // reduced by 90%" (#2453): 0.34 × 0.294 ≈ 0.10 while enchanted.
  "icy-shackles": define("icy-shackles", "Icy Shackles", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.34,
    moveSpeedWhileEnchanted: 0.294,
  }),
  // "For 15 seconds, your next 1...5 spells recharge 25% faster and
  // projectiles from the affected spells move 200% faster" (#2453): 4 at
  // rank 12, 3× as fast.
  "glyph-of-swiftness": define("glyph-of-swiftness", "Glyph of Swiftness", "glyph", {
    profession: "elementalist",
    nextSpells: {
      count: { scaling: { attributeId: "elementalist.air-magic", atZero: 1, atTwelve: 4.2 } },
      costReduction: 0,
      noOvercast: false,
      rechargeFaster: 0.25,
      projectileSpeedMultiplier: 3,
    },
  }),
  // What the ward projects on the foes inside it: "foes in this area become
  // Weakened for 5...20 seconds whenever they take elemental damage"
  // (#2453): 17 at rank 12, at the ward's Elementalist's.
  "ward-of-weakness": define("ward-of-weakness", "Ward of Weakness", "skill-effect", {
    profession: "elementalist",
    triggers: [
      {
        on: "bearer-takes-elemental-damage",
        target: "bearer",
        effects: [
          {
            kind: "apply-status",
            statusId: "weakness",
            durationSeconds: {
              scaling: { attributeId: "elementalist.earth-magic", atZero: 5, atTwelve: 17 },
            },
          },
        ],
        skillId: "elementalist.ward-of-weakness",
      },
    ],
  }),
};

/** Ether Renewal's count (#1984): `amount` for each enchantment on its bearer. */
function etherRenewalPer(amount: number): PerCount {
  return {
    count: { kind: "statuses", on: "caster", categories: ["enchantment"] },
    amount: { flat: amount },
    max: undefined,
  };
}

/**
 * A conjure (#1984): every attack of the bearer's that a weapon of
 * `element` deals, a wand's or a staff's included, strikes for 17 more
 * of it, apart from the blow.
 */
function conjure(id: ElementalistStatusId, name: string, element: DamageType): StatusDefinition {
  return define(id, name, "enchantment", {
    profession: "elementalist",
    onAttackHit: {
      attackSkillsOnly: false,
      weapon: undefined,
      weaponDamage: element,
      atSourceRanks: false,
      effects: [{ kind: "damage", amount: { flat: 17 }, type: element, armorPenetration: 0 }],
      skillId: `elementalist.${id}`,
    },
  });
}

/**
 * An attunement (#1614): "you gain 1 Energy plus 30% of the base Energy
 * cost of the skill each time you use Fire Magic", the share rounded half
 * up, as GW1 does.
 */
function attunement(
  id: ElementalistStatusId,
  name: string,
  attribute: "fire-magic" | "water-magic" | "air-magic" | "earth-magic",
): StatusDefinition {
  return define(id, name, "enchantment", {
    profession: "elementalist",
    triggers: [
      {
        on: "bearer-uses-skill",
        usedSkill: { attributes: { attributeId: `elementalist.${attribute}` } },
        target: "bearer",
        effects: [
          { kind: "energy-gain", amount: { flat: 1 } },
          { kind: "energy-gain", amount: { flat: 0.3 }, perUsedSkillEnergy: true },
        ],
        skillId: `elementalist.${id}`,
      },
    ],
  });
}
