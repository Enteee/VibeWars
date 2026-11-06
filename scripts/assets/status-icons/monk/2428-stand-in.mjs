import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Rank-scaled speed, reversal and next-hit cut (#2428), stand-ins until their art card.
  // Enchantment: a shield around a plus, the next hit heals.
  "life-sheath": [
    "enchantment",
    (c) =>
      `<path d="M12 4l7 3v5c0 4-3 6-7 8-4-2-7-4-7-8V7z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 9v6M9 12h6" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a shield over a falling chevron, the next hit cut.
  "reverse-hex": [
    "enchantment",
    (c) =>
      `<path d="M12 4l6 3v4c0 3-3 5-6 6-3-1-6-3-6-6V7z" ${stroke(c, 1.8)}/>` +
      `<path d="M9 17l3 3 3-3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
