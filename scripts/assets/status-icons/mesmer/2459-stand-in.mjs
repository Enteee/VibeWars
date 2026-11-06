import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2459), stand-ins until their art card.
  // Hex: an hourglass with an arrow leaving it, its speed taken.
  "stolen-speed": [
    "hex",
    (c) =>
      `<path d="M6 5h8M6 19h8M7 5c0 5 6 5 6 7s-6 2-6 7M13 5c0 5-6 5-6 7s6 2 6 7" ${stroke(c, 1.6)}/>` +
      `<path d="M15 12h6M18 9l3 3-3 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
