import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Smoke Powder Defense (#2362), art #2375.
  // Stance: a cloud of smoke over a ground line.
  "smoke-powder-defense": [
    "stance",
    (c) =>
      `<path d="M7 16a3.500 3.500 0 0 1 0-7 4.500 4.500 0 0 1 9-1 4 4 0 0 1 1 8z" ${stroke(c, 1.8)}/>` +
      `<path d="M4 20h16" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
