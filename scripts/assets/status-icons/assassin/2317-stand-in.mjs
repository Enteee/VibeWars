import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ranger staples (#2317), stand-in until its art card.
  // Stance: a plume of smoke over a halved bar, the blow taken at half.
  "smoke-powder-defense": [
    "stance",
    (c) =>
      `<path d="M8 13c-3 0-4-3-2-5 0-3 4-4 6-2 2-2 6-1 6 2 2 2 1 5-2 5z" ${stroke(c, 1.6)}/>` +
      `<path d="M4 19h16" ${stroke(c, 1.4)}/><path d="M4 19h8" ${stroke(c, 3)}/>`,
  ],
};

export default rows;
