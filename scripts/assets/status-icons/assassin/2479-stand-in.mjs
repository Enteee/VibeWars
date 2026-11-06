import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2479), stand-ins until their art card.
  // Hex: a shroud over a struck-out star, no enchantment lands.
  "shadow-shroud": [
    "hex",
    (c) =>
      `<path d="M5 19c0-8 3-14 7-14s7 6 7 14" ${stroke(c, 1.8)}/>` +
      `<path d="M8 10l8 8M16 10l-8 8" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
