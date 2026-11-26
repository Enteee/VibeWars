import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Counts and charges (#2373, #2438), art #2441.
  // Hex: a target ring with four ticks and a crack, as the skill's.
  "mark-of-insecurity": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="4.500" ${stroke(c, 1.7)}/>` +
      `<path d="M12 5.500V7.500M12 16.500V18.500M5.500 12H7.500M16.500 12H18.500" ${stroke(c, 1.5)}/>` +
      `<path d="M13.500 9.500L11 12.500L13 13L10.500 15.500" ${stroke(c, 1.2)}/>`,
  ],
};

export default rows;
