import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Dropped leftovers (#2446), art #2469.
  // Enchantment: a seal with two chevrons, as the skill's.
  "symbolic-celerity": [
    "enchantment",
    (c) =>
      `<rect x="6" y="6" width="12" height="12" rx="2" ${stroke(c, 1.6)}/>` +
      `<path d="M9.500 9.500L12 12L9.500 14.500M13 9.500L15.500 12L13 14.500" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
