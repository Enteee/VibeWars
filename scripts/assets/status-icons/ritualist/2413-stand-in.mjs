import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2413), stand-ins until their art card.
  // Hex: two chain links over a slow chevron.
  "binding-chains": [
    "hex",
    (c) =>
      `<rect x="5.500" y="8.500" width="7" height="4" rx="2" ${stroke(c, 1.6)}/>` +
      `<rect x="11.500" y="8.500" width="7" height="4" rx="2" ${stroke(c, 1.6)}/>` +
      `<path d="M9.500 15l2.500 2 2.500-2" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
