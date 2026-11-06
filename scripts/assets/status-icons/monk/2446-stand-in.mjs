import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Dropped leftovers (#2446), stand-ins until their art card.
  // Enchantment: a plus with speed lines, heals cast faster and stronger.
  "healers-boon": [
    "enchantment",
    (c) =>
      `<path d="M14 7v10M9 12h10" ${stroke(c, 2.2)}/>` +
      `<path d="M4.5 9h3M4 12h3M4.5 15h3" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
