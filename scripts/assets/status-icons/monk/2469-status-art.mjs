import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Dropped leftovers (#2446), art #2469.
  // Enchantment: a plus split by chevrons, as the skill's.
  "healers-boon": [
    "enchantment",
    (c) =>
      `<path d="M10.500 5H13.500V10.500H19V13.500H13.500V19H10.500V13.500H5V10.500H10.500Z" ${stroke(c, 1.4)}/>` +
      `<path d="M9 9.500L11.500 12L9 14.500" ${stroke(c, 1.2)}/>`,
  ],
};

export default rows;
