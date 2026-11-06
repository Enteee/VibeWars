import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mark of Insecurity (#2373), a stand-in until its art card.
  // Hex: a target mark over a cracked ring.
  "mark-of-insecurity": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="7" ${stroke(c, 1.8)}/>` +
      `<path d="M12 3v5M12 16v5M3 12h5M16 12h5M10 10l2 2-1 2" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
