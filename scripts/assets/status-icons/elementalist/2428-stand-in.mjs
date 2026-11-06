import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Rank-scaled speed, reversal and next-hit cut (#2428), stand-ins until their art card.
  // Enchantment: a flame trailing speed lines, on fire and fast.
  "burning-speed": [
    "enchantment",
    (c) =>
      `<path d="M14 19c-3 0-4-2-4-4 0-3 3-4 3-8 2 2 4 4 4 8 0 2-1 4-3 4z" ${stroke(c, 1.8)}/>` +
      `<path d="M5 10h4M4 14h5M5 18h4" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
