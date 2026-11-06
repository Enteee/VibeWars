import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2470), a stand-in until its art card.
  // Enchantment: a figure raised on a held line, up while it is kept.
  "unyielding-aura": [
    "enchantment",
    (c) =>
      `<path d="M14 18V9M10 12l4-4 4 4" ${stroke(c, 2.2)}/>` +
      `<path d="M9 19h10" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
