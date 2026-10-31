import { stroke } from "../icon-kit.mjs";

/** @type {Readonly<Record<string, [import("../icon-kit.mjs").Category, import("../icon-kit.mjs").Glyph]>>} */
export const RANGER_STATUS_ICONS = {
  // Enchantment: plus, health coming back.
  regeneration: ["enchantment", (c) => `<path d="M12 6v12M6 12h12" ${stroke(c, 3)}/>`],
  // Stance: a leaf, the wild's stride: faster, blocks (#919).
  "natural-stride": [
    "stance",
    (c) =>
      `<path d="M7 19c0-6 4-10.5 10-10.5 0 6-4 10.5-10 10.5z" ${stroke(c, 1.8)}/>` +
      `<path d="M7 19l6.5-6.5" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: a bolt, blocks and attacks faster (#976).
  "lightning-reflexes": [
    "stance",
    (c) => `<path d="M13.5 5L8 13h4l-1.5 6L16 11h-4z" ${stroke(c, 2)}/>`,
  ],
  // Stance: two chevrons and a bar, away and blocking (#976).
  escape: [
    "stance",
    (c) =>
      `<path d="M6 8.5l4 3.5-4 3.5M11 8.5l4 3.5-4 3.5" ${stroke(c, 2.2)}/>` +
      `<path d="M18 7.5v9" ${stroke(c, 2.2)}/>`,
  ],
  // Ranger staples (#1539), stand-ins until the asset-designer's.
  // Stance: a circling arc, blocks and hurts who is adjacent.
  "whirling-defense": [
    "stance",
    (c) => `<path d="M17 8a6 6 0 1 0 1 6M18 5v4h-4" ${stroke(c, 2.2)}/>`,
  ],
  // Stance: a wavy serpent, skills recharge faster.
  "serpents-quickness": [
    "stance",
    (c) => `<path d="M5 16c3 0 3-8 6-8s3 8 6 8M17 16l2-2" ${stroke(c, 2.2)}/>`,
  ],
  // Stance: a step aside an arrow, faster and blocks projectiles.
  dodge: ["stance", (c) => `<path d="M4 8h10M11 5l3 3-3 3M8 18l4-5 4 5" ${stroke(c, 2.2)}/>`],
  // Stance: Dodge's step aside an arrow, with a speed line under it (#1676),
  // a stand-in until the asset-designer's.
  "zojuns-haste": [
    "stance",
    (c) => `<path d="M4 7h10M11 4l3 3-3 3M8 16l4-5 4 5M5 20h14" ${stroke(c, 2.2)}/>`,
  ],
  // Preparation: one drop, your attacks poison (#525).
  "apply-poison": [
    "preparation",
    (c) => `<path d="M12 8.5c-2 3-3 4.6-3 6.2a3 3 0 0 0 6 0c0-1.6-1-3.2-3-6.2z" fill="${c}"/>`,
  ],
  // Skill effect: a blade and a plus, hits land harder near Winnowing (#1064).
  winnowing: [
    "skill-effect",
    (c) =>
      `<path d="M5 17L13 9" ${stroke(c, 2.2)}/>` + `<path d="M17 6v6M14 9h6" ${stroke(c, 2)}/>`,
  ],
  // Shout: two chevrons right, the pet bites and runs faster (#1108).
  "call-of-haste": [
    "shout",
    (c) => `<path d="M7 7.5l4.5 4.5L7 16.5M12.5 7.5l4.5 4.5-4.5 4.5" ${stroke(c, 2.2)}/>`,
  ],
  // Shout: a shield with a minus, less damage to the pet (#1108).
  "call-of-protection": [
    "shout",
    (c) =>
      `<path d="M7 5.5h10v5.5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" ${stroke(c, 2)}/>` +
      `<path d="M9.5 11h5" ${stroke(c, 2.2)}/>`,
  ],
  // Shout: two linked rings, half the pet's hurt shared with you (#1108).
  "symbiotic-bond": [
    "shout",
    (c) =>
      `<circle cx="9.5" cy="12" r="3.5" ${stroke(c, 2)}/><circle cx="14.5" cy="12" r="3.5" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: two rising flames, adrenaline comes faster near the spirit.
  "infuriating-heat": [
    "skill-effect",
    (c) =>
      `<path d="M8 6c.4 2.5 3 4 3 7a3 3 0 0 1-6 0c0-1.6.7-2.8 1.6-3.4 0 1.2.3 1.8.9 2.1C7.2 9.8 6.8 7.6 8 6zM16 6c.4 2.5 3 4 3 7a3 3 0 0 1-6 0c0-1.6.7-2.8 1.6-3.4 0 1.2.3 1.8.9 2.1-.3-1.9-.7-4.1.5-5.7z" fill="${c}"/>` +
      `<path d="M6 19.5h12" ${stroke(c, 1.8)}/>`,
  ],
  // Preparation: an arrow with a flame at its head, your arrows burn.
  "kindle-arrows": [
    "preparation",
    (c) =>
      `<path d="M3.5 15L13 5.5" ${stroke(c, 2)}/>` +
      `<path d="M19 2.5L9.5 5.5L16 12Z" fill="${c}"/>` +
      `<path d="M16 11c.6 3 3.5 4 3.5 7a3.5 3.5 0 0 1-7 0c0-1.5.6-2.6 1.5-3.2 0 1.2.4 1.8 1 2.1-.3-1.8.5-3.7 1-5.9z" fill="${c}"/>`,
  ],
  // Preparation: an arrow with a burst beside it, as the skill's icon (Ignite Arrows).
  "ignite-arrows": [
    "preparation",
    (c) =>
      `<path d="M3.5 15L13 5.5" ${stroke(c, 2)}/>` +
      `<path d="M19 2.5L9.5 5.5L16 12Z" fill="${c}"/>` +
      `<path d="M16 11.5V20M12 15.8H20.5M13.2 13L18.8 18.6M18.8 13L13.2 18.6" ${stroke(c, 1.8)}/>`,
  ],
};
