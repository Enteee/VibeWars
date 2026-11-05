import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Strength of Honor (#2367), stand-in until its art card.
  // Enchantment: a blade with a plus at its hilt: more melee damage.
  "strength-of-honor": [
    "enchantment",
    (c) =>
      `<path d="M14 4l5 0 0 5-8 8-5-5z" ${stroke(c, 1.8)}/>` +
      `<path d="M5 15v6M2 18h6" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
