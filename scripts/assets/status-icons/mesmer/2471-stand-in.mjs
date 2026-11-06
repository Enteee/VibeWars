import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2471), stand-in until its art card.
  // Hex: a blade whose blow curls back on its wielder.
  "calculated-risk": [
    "hex",
    (c) =>
      `<path d="M8 16l7-7M14 7h3v3M7 13l4 4" ${stroke(c, 1.8)}/>` +
      `<path d="M15 13c0 3-2 4-4.5 4" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
