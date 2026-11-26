import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2504), stand-in until its art card.
  // Speed chevrons beside a spirit's flame: spells recharge faster near one.
  "ghostly-haste": [
    "enchantment",
    (c) =>
      `<path d="M8 9l2 3-2 3M11 9l2 3-2 3" ${stroke(c, 1.4)}/><path d="M15.500 15a1.500 1.500 0 0 1 0-4l.5 2z" fill="${c}"/>`,
  ],
};

export default rows;
