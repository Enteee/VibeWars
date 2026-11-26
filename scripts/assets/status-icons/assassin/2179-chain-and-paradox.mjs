import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Chain and Paradox tools (#2134, art #2179).
  // Enchantment: an open palm, free off-hand and dual attacks.
  "way-of-the-empty-palm": [
    "enchantment",
    (c) => `<path d="M7 20v-8M7 12V6M10 12V4M13 12V5M16 13V8M7 20h8l3-7" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: two crossed blades over a falling bar, the dual hit that topples.
  "mark-of-instability": [
    "hex",
    (c) =>
      `<path d="M5 4l10 10M19 4L9 14" ${stroke(c, 2)}/>` + `<path d="M4 19h16" ${stroke(c, 2)}/>`,
  ],
  // Stance: a blade crossed out beside a fast arrow, attacks traded for speed.
  "deadly-paradox": [
    "stance",
    (c) =>
      `<path d="M5 19L13 11M5 11l8 8" ${stroke(c, 2)}/>` +
      `<path d="M12 6h8M17 3l3 3-3 3" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: a closed eye and a blade passing a broken shield line.
  "unseen-fury": [
    "stance",
    (c) =>
      `<path d="M3 8c3 3 9 3 12 0" ${stroke(c, 1.8)}/>` +
      `<path d="M6 20l14-10M14 14v6M14 4v4" ${stroke(c, 2)}/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2422). */
const fits = {
  "mark-of-instability": [0.68, 0],
  "deadly-paradox": [0.98, 2],
  "unseen-fury": [1, 1],
};

export default fitRows(rows, fits);
