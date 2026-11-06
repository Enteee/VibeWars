import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2447), stand-ins until their art card.
  // Enchantment: a mask with a line through each side, foes lose energy.
  "ancestors-visage": [
    "enchantment",
    (c) =>
      `<path d="M6 6c4-2 8-2 12 0v5c0 4-3 7-6 7s-6-3-6-7z" ${stroke(c, 1.8)}/>` +
      `<path d="M9 10h1.5M13.5 10H15M3 19l3-3M21 19l-3-3" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
