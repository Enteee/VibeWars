import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2413), stand-ins until their art card.
  // Enchantment: a whetted dagger over a drop, Bleeding on its blows.
  "sharpen-daggers": [
    "enchantment",
    (c) =>
      `<path d="M5 15L15 5M15 5l3-1-1 3M8 12l4 4" ${stroke(c, 1.8)}/>` +
      `<path d="M17 13c1.500 2.200 2 3 2 3.800a2 2 0 0 1-4 0c0-.800.500-1.600 2-3.800z" fill="${c}"/>`,
  ],
};

export default rows;
