import { AREA_NEARBY } from "../../distances.js";
import type { StatusDefinition } from "../status.js";
import { define } from "./define.js";

export type ElementalistStatusId =
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
  | "freezing-gust";

export const ELEMENTALIST_STATUSES: Readonly<Record<ElementalistStatusId, StatusDefinition>> = {
  // "...move 66% slower for 2...5...6 seconds" (#918).
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
  // "For 10 seconds, all foes move 66% slower" (#938).
  "deep-freeze": define("deep-freeze", "Deep Freeze", "hex", {
    profession: "elementalist",
    attribute: "elementalist.water-magic",
    moveSpeedMultiplier: 0.34,
  }),
  // The slow is Armor of Earth's price: without it, +24 armor is free.
  "armor-boost": define("armor-boost", "Armor Boost", "enchantment", {
    profession: "elementalist",
    armorModifier: 24,
    moveSpeedMultiplier: 0.75,
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
    nextSpells: { count: 2, costReduction: 16 },
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
        effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: 3 }],
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
          { kind: "heal", amount: { flat: 3.6 }, perStatusOnTarget: [], perUsedSkillEnergy: true },
        ],
        skillId: "elementalist.aura-of-restoration",
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
};

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
        usedSkill: { attribute: `elementalist.${attribute}` },
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
