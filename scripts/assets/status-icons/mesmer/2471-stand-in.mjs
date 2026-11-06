import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Attack backfire (#2471), a stand-in until its art card.
  // Hex: a sword whose blade bends back on its own hilt, a blow that may return.
  "calculated-risk": [
    "hex",
    (c) =>
      `<path d="M11 17V9M9 15h4" ${stroke(c, 2)}/>` +
      `<path d="M11 9c0-2 4-2 4 0.5s-2 2.5-2 2.5" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
