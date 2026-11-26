import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2413, #2414), art #2431.
  // Hex: two chain links over a chevron, as the skill's.
  "binding-chains": [
    "hex",
    (c) =>
      `<rect x="6" y="8" width="7" height="4.500" rx="2.200" ${stroke(c, 1.5)}/>` +
      `<rect x="11" y="8" width="7" height="4.500" rx="2.200" ${stroke(c, 1.5)}/>` +
      `<path d="M9.500 15.500l2.500 2 2.500-2" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
