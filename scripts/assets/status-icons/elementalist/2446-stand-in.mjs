import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Dropped leftovers (#2446), stand-ins until their art card.
  // Enchantment: a bolt with speed lines, faster at an Energy cost.
  "storm-djinns-haste": [
    "enchantment",
    (c) =>
      `<path d="M15 4l-4 7h4l-3 9" ${stroke(c, 2)}/>` +
      `<path d="M4.5 9h4M4 13h4M4.5 17h3.5" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
