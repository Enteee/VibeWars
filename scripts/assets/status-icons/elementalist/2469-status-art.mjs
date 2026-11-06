import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Dropped leftovers (#2446), art #2469.
  // Enchantment: a funnel with a bolt, as the skill's.
  "storm-djinns-haste": [
    "enchantment",
    (c) =>
      `<path d="M6 7H18M8 11H16M10 15H14" ${stroke(c, 1.6)}/>` +
      `<path d="M13.500 5L10.500 12H13.500L11 18" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
