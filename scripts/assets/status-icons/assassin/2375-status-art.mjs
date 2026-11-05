import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Smoke Powder Defense (#2362), art #2375.
  // Stance: an eye struck through, the blinded foe.
  "smoke-powder-defense": [
    "stance",
    (c) =>
      `<path d="M3 12c3-5 15-5 18 0-3 5-15 5-18 0z" ${stroke(c, 1.7)}/>` +
      `<circle cx="12" cy="12" r="1.800" ${stroke(c, 1.5)}/>` +
      `<path d="M5 19 19 5" ${stroke(c, 1.9)}/>`,
  ],
};

export default rows;
