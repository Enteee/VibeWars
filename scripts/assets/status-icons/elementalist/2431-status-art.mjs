import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2413, #2414), art #2431.
  // Enchantment: a flame with two forward chevrons, as the skill's.
  "flame-djinns-haste": [
    "enchantment",
    (c) =>
      `<path d="M11 5q4.500 4 3 9a4 4 0 0 1-8 0q0-3 2-5 .5 2 1.500 2.500Q9 8 11 5z" ${stroke(c, 1.6)}/>` +
      `<path d="M15.500 9.500l3 2.500-3 2.500M18.500 9.500l3 2.500-3 2.500" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
