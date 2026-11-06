import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2406), stand-ins until their art card.
  // Stance: three quick slashes over a run chevron, faster both ways.
  "primal-rage": [
    "stance",
    (c) =>
      `<path d="M6.500 14l2.500-7M10.500 14l2.500-7M14.500 14l2.500-7" ${stroke(c, 2)}/>` +
      `<path d="M8 17l4 3 4-3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
