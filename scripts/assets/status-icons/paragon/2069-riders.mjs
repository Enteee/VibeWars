import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Shout (#2069): an open hand behind a bar.
  "cant-touch-this": [
    "shout",
    (c) =>
      `<path d="M8 20V9a1.5 1.5 0 0 1 3 0v4V6a1.5 1.5 0 0 1 3 0v7V8a1.5 1.5 0 0 1 3 0v7c0 3-2 5-5 5z" ${stroke(c, 1.6)}/>` +
      `<path d="M4 4l16 16" ${stroke(c, 2)}/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2404). */
const fits = {
  "cant-touch-this": [0.8, 0],
};

export default fitRows(rows, fits);
