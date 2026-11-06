import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2406), art #2410.
  // Stance: a furious face with speed lines behind it, as the skill's.
  "primal-rage": [
    "stance",
    (c) =>
      `<circle cx="13.500" cy="12" r="6" ${stroke(c, 1.8)}/>` +
      `<path d="M10.500 10l2.500 1.500M16.500 10L14 11.500M11 15h5" ${stroke(c, 1.6)}/>` +
      `<path d="M4 9h3M4 12.500h2.500M5 16h2" ${stroke(c, 1.5)}/>`,
  ],
};

export default rows;
