import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Casting-state hexes (#1931), stand-ins until their art card.
  // Hex: a spine with a snowflake, cold breaks the cast.
  "spinal-shivers": [
    "hex",
    (c) =>
      `<path d="M8 3v18M5.5 6h5M5.5 10h5M5.5 14h5M5.5 18h5" ${stroke(c, 1.8)}/>` +
      `<path d="M17 8v8M13.5 10l7 4M20.5 10l-7 4" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
