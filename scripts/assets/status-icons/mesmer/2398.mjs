import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Signet of Recall (#2374), art #2398.
  // Skill effect: a swing out and back, ending at a bolt.
  "signet-of-recall": [
    "skill-effect",
    (c) =>
      `<path d="M6 6c.500 7 3.500 12 7 11.500" ${stroke(c, 1.8)}/>` +
      `<path d="M13 15.500l5 3-5 3z" fill="${c}"/>` +
      `<path d="M17 3.500L13 9h3l-1 4.500 5-6.500h-3z" fill="${c}"/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2422). */
const fits = {
  "signet-of-recall": [0.86, 0],
};

export default fitRows(rows, fits);
