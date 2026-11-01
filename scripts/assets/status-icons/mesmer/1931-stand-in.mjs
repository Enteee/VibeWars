import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Casting-state hexes (#1931), stand-ins until their art card.
  // Hex: a bolt drawn out of a drop, each spell leaks Energy.
  "power-leech": [
    "hex",
    (c) =>
      `<path d="M12 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z" ${stroke(c, 1.8)}/>` +
      `<path d="M13 9l-3 4h4l-3 4" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
