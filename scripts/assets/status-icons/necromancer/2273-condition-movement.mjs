import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Condition movement (#2259, art #2273).
  // Hex: a diamond mark with a bolt through it, the fury.
  "mark-of-fury": [
    "hex",
    (c) =>
      `<path d="M12 3L20 12L12 21L4 12z" ${stroke(c, 1.8)}/>` +
      `<path d="M13.5 7L9.5 12.5H14L10.5 17" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
