import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2447), art #2456.
  // Enchantment: a mask with eye slits and two drops, as the skill's.
  "ancestors-visage": [
    "enchantment",
    (c) =>
      `<path d="M7 5H17V11C17 14 14.500 15.500 12 15.500C9.500 15.500 7 14 7 11Z" ${stroke(c, 1.5)}/>` +
      `<path d="M9.500 9L11 9.700M14.500 9L13 9.700" ${stroke(c, 1.3)}/>` +
      `<path d="M9 18V19.500M15 18V19.500" ${stroke(c, 1.5)}/>`,
  ],
};

export default rows;
