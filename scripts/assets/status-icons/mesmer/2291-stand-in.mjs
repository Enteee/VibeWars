import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchanter's Conundrum (#2291), a stand-in until its art card.
  // Hex: a question mark: enchantments cast slowly.
  "enchanters-conundrum": [
    "hex",
    (c) =>
      `<path d="M9 9a3 3 0 1 1 4 3c-1 .5-1 1.5-1 2.5" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="18" r="1" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
