import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Smoke Powder Defense (#2362), a stand-in until its art card.
  // Stance: a puff of smoke over a planted line.
  "smoke-powder-defense": [
    "stance",
    (c) =>
      `<path d="M7 15a3 3 0 0 1 1-6 4 4 0 0 1 8 0 3 3 0 0 1 1 6z" ${stroke(c, 1.8)}/>` +
      `<path d="M4 20h16" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
