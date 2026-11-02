import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ranger staples (#2190), stand-ins until their art card.
  // Stance: three claw marks and a speed chevron, attacks 25% faster.
  "tigers-fury": [
    "stance",
    (c) =>
      `<path d="M5 5l5 12M10 4l4 12M15 5l3 9" ${stroke(c, 1.8)}/>` +
      `<path d="M15 18l3 2.5 3-2.5" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
