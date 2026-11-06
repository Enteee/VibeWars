import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2479), stand-ins until their art card.
  // Hex: a shroud over a struck-out star, no enchantment lands.
  "shadow-shroud": [
    "hex",
    (c) =>
      `<path d="M7 17c0-6 2.5-10 5-10s5 4 5 10" ${stroke(c, 1.8)}/>` +
      `<path d="M9.5 12.5l5 5M14.5 12.5l-5 5" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
