import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Hex: a ring with a struck spark and a drop, the spell fails and Health is stolen.
  "mark-of-subversion": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="9" ${stroke(c, 1.8)} stroke-dasharray="4 3"/>` +
      `<path d="M10.500 6l1.500 4 4 1.500-4 1.500-1.500 4-1.500-4-4-1.500 4-1.500z" ${stroke(c, 1.5)}/>` +
      `<path d="M7 18L18 7" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
