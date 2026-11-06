import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Stance: a dagger with a star at its tip, daggers strike critical.
  "way-of-the-assassin": [
    "stance",
    (c) =>
      `<path d="M4 20l8-8M10 10l3 1-1 3z" ${stroke(c, 2)}/>` +
      `<path d="M17 3l1.5 3.5L22 8l-3.5 1.5L17 13l-1.5-3.5L12 8l3.5-1.5z" ${stroke(c, 1.5)}/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2422). */
const fits = {
  "way-of-the-assassin": [0.92, 1],
};

export default fitRows(rows, fits);
