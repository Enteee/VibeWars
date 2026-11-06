import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2459), stand-ins until their art card.
  // Hex: an hourglass with an arrow leaving it, its speed taken.
  "stolen-speed": [
    "hex",
    (c) =>
      `<path d="M7 7h6M7 17h6M8 7c0 3.5 4 3.5 4 5s-4 1.5-4 5M12 7c0 3.5-4 3.5-4 5s4 1.5 4 5" ${stroke(c, 1.6)}/>` +
      `<path d="M14 12h5M17 10l2 2-2 2" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
