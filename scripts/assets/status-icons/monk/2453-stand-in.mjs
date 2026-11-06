import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2453), stand-ins until their art card.
  // Enchantment: two bolts side by side, the Divine Favor doubled.
  "smiters-boon": [
    "enchantment",
    (c) => `<path d="M10 8l-2 4h2l-1 4M15 8l-2 4h2l-1 4" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
