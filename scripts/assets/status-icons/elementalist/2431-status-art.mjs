import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2413, #2414), art #2431.
  // Enchantment: a flame with speed lines behind it, as the skill's.
  "flame-djinns-haste": [
    "enchantment",
    (c) =>
      `<path d="M14 5q4.500 4 3 9a4 4 0 0 1-8 0q0-3 2-5 .5 2 1.500 2.500Q12 8 14 5z" ${stroke(c, 1.6)}/>` +
      `<path d="M3.500 10h3.500M3.500 14h2.500M3.500 18h3.500" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
