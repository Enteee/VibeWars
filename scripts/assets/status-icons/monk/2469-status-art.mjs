import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Dropped leftovers (#2446), art #2469.
  // Enchantment: a plus with two chevrons beside it, as the skill's.
  "healers-boon": [
    "enchantment",
    (c) =>
      `<path d="M8.500 7V17M4.500 12H12.500" ${stroke(c, 2.2)}/>` +
      `<path d="M13 8L16 12L13 16M16.500 8L19.500 12L16.500 16" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
