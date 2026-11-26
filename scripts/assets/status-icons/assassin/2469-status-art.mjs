import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Dropped leftovers (#2446), art #2469.
  // Hex: a dashed leap ending in a dagger, as the skill's.
  "augury-of-death": [
    "hex",
    (c) =>
      `<path d="M8.500 15C8.500 12 10 10 13 9.500" ${stroke(c, 1.4)} stroke-dasharray="2 1.600"/>` +
      `<path d="M13.500 8L16.500 8L15.500 10.500L15.500 12L14.500 12L14.500 10.500Z" ${stroke(c, 1.3)}/>`,
  ],
};

export default rows;
