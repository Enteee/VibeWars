import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2278), stand-ins until their art card.
  // Enchantment: an hourglass, Energy waiting for its end.
  "mantra-of-recall": [
    "enchantment",
    (c) =>
      `<path d="M7 5h10M7 19h10" ${stroke(c, 1.8)}/>` +
      `<path d="M8 5c0 4 8 4 8 7s-8 3-8 7M16 5c0 4-8 4-8 7s8 3 8 7" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
