import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Shared Burden (#2367), stand-in until its art card.
  // Hex: a weight over chevrons pointing back: all of them slowed.
  "shared-burden": [
    "hex",
    (c) =>
      `<path d="M8 5h8l2 7H6z" ${stroke(c, 1.8)}/>` +
      `<path d="M11 15l-3 3 3 3M17 15l-3 3 3 3" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
