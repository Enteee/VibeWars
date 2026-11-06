import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Condition movement (#2259, art #2273).
  // Hex: a crescent moon with a drop in its hollow, the fevered dream.
  "fevered-dreams": [
    "hex",
    (c) =>
      `<path d="M15 4a8.5 8.5 0 1 0 5 12.5A7 7 0 0 1 15 4z" ${stroke(c, 1.8)}/>` +
      `<path d="M14 10c-1.4 2-2 3-2 4a2 2 0 0 0 4 0c0-1-.6-2-2-4z" ${stroke(c, 1.6)}/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2422). */
const fits = {
  "fevered-dreams": [0.82, 0],
};

export default fitRows(rows, fits);
