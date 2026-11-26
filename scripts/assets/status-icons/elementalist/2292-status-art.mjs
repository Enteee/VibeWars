import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Hex: a four-point spark between two small ones, hurting the foe and those beside it each second.
  "glimmering-mark": [
    "hex",
    (c) =>
      `<path d="M12 4l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" ${stroke(c, 1.8)}/>` +
      `<path d="M4 18v3M2.5 19.5h3M20 3v3M18.5 4.5h3" ${stroke(c, 1.6)}/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2421). */
const fits = {
  "glimmering-mark": [0.62, 0],
};

export default fitRows(rows, fits);
