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
  | "ward-against-elements";

export const ELEMENTALIST_STATUSES: Readonly<Record<ElementalistStatusId, StatusDefinition>> = {
  // "...move 66% slower for 2...5...6 seconds" (#918).
  "shard-storm": define("shard-storm", "Shard Storm", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.34,
  }),
  // "...move 66% slower for 2...5...6 seconds" (#938).
  "ice-spikes": define("ice-spikes", "Ice Spikes", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.34,
  }),
  // "For 10 seconds, all foes move 66% slower" (#938).
  "deep-freeze": define("deep-freeze", "Deep Freeze", "hex", {
    profession: "elementalist",
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
  // "For 8...20 seconds, target foe's legs are encased in ice, causing the
  // foe to move 66% slower" (#1367).
  "ice-prison": define("ice-prison", "Ice Prison", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.34,
  }),
  // "...and move 66% slower for 3...8 seconds" (#1367).
  "frozen-burst": define("frozen-burst", "Frozen Burst", "hex", {
    profession: "elementalist",
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
    moveSpeedMultiplier: 0.1,
  }),
  // Necromancer and Elementalist staples (#1540), at their rank-12 values.
  // "...whenever each foe is struck for fire damage, that foe is set on
  // fire for 1...4 seconds": 3. A life steal is no strike.
  "mark-of-rodgort": define("mark-of-rodgort", "Mark of Rodgort", "hex", {
    profession: "elementalist",
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
};
