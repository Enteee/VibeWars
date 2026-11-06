import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2453), stand-ins until their art card.
  // Enchantment: a stone block with a minus, damage taken less.
  "stoneflesh-aura": [
    "enchantment",
    (c) =>
      `<path d="M8 9l4-2 4 2v6l-4 2-4-2z" ${stroke(c, 1.8)}/>` +
      `<path d="M10 12h4" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: two linked rings, a shackle.
  "icy-shackles": [
    "hex",
    (c) =>
      `<circle cx="10" cy="13" r="2.4" ${stroke(c, 1.8)}/>` +
      `<circle cx="14" cy="13" r="2.4" ${stroke(c, 1.8)}/>`,
  ],
  // Glyph: two chevrons, faster.
  "glyph-of-swiftness": ["glyph", (c) => `<path d="M8 8l3 3-3 3M12 8l3 3-3 3" ${stroke(c, 1.8)}/>`],
  // Skill effect: a down arrow over a ground line, Weakened in the ward.
  "ward-of-weakness": [
    "skill-effect",
    (c) => `<path d="M12 7v6M9.5 10.5L12 13l2.5-2.5M8 16h8" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
