import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: wind streaks, the upper one curling, moving faster.
  gust: [
    "enchantment",
    (c) =>
      `<path d="M4 9h10a2.500 2.500 0 1 0-2.500-2.500" ${stroke(c, 1.8)}/>` +
      `<path d="M4 14h15M4 19h8" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a diamond mirror with two glints, slowed by its reflection.
  "mirror-of-ice": [
    "hex",
    (c) =>
      `<path d="M12 4l6 7-6 7-6-7z" ${stroke(c, 1.8)}/>` +
      `<path d="M9.500 10l1.500-1.500M12 13l2-2" ${stroke(c, 1.5)}/>`,
  ],
};

export default rows;
