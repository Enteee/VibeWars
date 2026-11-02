import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Monk mechanics (#2189), stand-ins until their art card.
  // Enchantment: a shield with a spark turned away above it.
  "spell-shield": [
    "enchantment",
    (c) =>
      `<path d="M6 8h12v4c0 3.5-3 6-6 8-3-2-6-4.5-6-8z" ${stroke(c, 2)}/>` +
      `<path d="M12 2.5v3M9.5 4l5 0" ${stroke(c, 1.8)}/>`,
  ],
  // Effect: a shield with two plates stacked inside it, armor per hex.
  "convert-hexes": [
    "skill-effect",
    (c) =>
      `<path d="M6 5h12v5.5c0 4-3 6.5-6 8.5-3-2-6-4.5-6-8.5z" ${stroke(c, 2)}/>` +
      `<path d="M9 9h6M9 12.5h6" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
