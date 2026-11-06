import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mesmer staples 5 (#2231), art #2251.
  // Hex: a closed eye over a falling drop, a nightmare's degeneration.
  "conjure-nightmare": [
    "hex",
    (c) =>
      `<path d="M5 9q7 6 14 0" ${stroke(c, 2)}/>` +
      `<path d="M12 13v6M9.5 16.5L12 19l2.5-2.5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a face and its mirror, a foe punished for attacking.
  "images-of-remorse": [
    "hex",
    (c) =>
      `<circle cx="8" cy="12" r="4" ${stroke(c, 1.8)}/><circle cx="16" cy="12" r="4" ${stroke(c, 1.8)}/>` +
      `<path d="M12 5v14" ${stroke(c, 1.4)}/>`,
  ],
  // Hex: an hourglass with a question mark, slow and confused casting.
  "confusing-images": [
    "hex",
    (c) =>
      `<path d="M7 4h10L7 20h10z" ${stroke(c, 1.8)}/>` +
      `<path d="M10 9q2-2 4 0t-2 3" ${stroke(c, 1.6)}/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2422). */
const fits = {
  "confusing-images": [0.8, 0],
};

export default fitRows(rows, fits);
