import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Attack backfire (#2471), a stand-in until its art card.
  // Hex: a sword whose blade bends back on its own hilt, a blow that may return.
  "calculated-risk": [
    "hex",
    (c) =>
      `<path d="M8 19V8M5 16h6M8 8c0-4 9-4 9 1s-5 5-6 3" ${stroke(c, 2)}/>` +
      `<path d="M13 9.5l-2 2.5 3 1" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
