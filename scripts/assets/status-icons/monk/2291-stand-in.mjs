import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Life Bond, Life Attunement, Aura of Faith, Peace and Harmony (#2291), stand-ins until their art card.
  // Enchantment: two linked rings, a blow passing from one to the other.
  "life-bond": [
    "enchantment",
    (c) =>
      `<circle cx="8" cy="12" r="4.5" ${stroke(c, 1.6)}/>` +
      `<circle cx="16" cy="12" r="4.5" ${stroke(c, 1.6)}/>` +
      `<path d="M6 5l3 3M18 5l-3 3" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a plus over a dulled blade: healed more, hitting softer.
  "life-attunement": [
    "enchantment",
    (c) =>
      `<path d="M12 4v8M8 8h8" ${stroke(c, 1.8)}/>` +
      `<path d="M6 19l8-5M14 14l2 2" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a plus inside a ring: healed more, taking less.
  "aura-of-faith": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="7.5" ${stroke(c, 1.6)}/>` +
      `<path d="M12 8v8M8 12h8" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: an hourglass running fast: conditions and hexes run out.
  "peace-and-harmony": [
    "enchantment",
    (c) =>
      `<path d="M7 5h10M7 19h10M8 5c0 4 8 4 8 7s-8 3-8 7M16 5c0 4-8 4-8 7" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
