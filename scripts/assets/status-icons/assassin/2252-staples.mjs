import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Assassin staples 6 (#2233), stand-in until its art card: two caltrops,
  // and a bar dragging the step arrowhead, it moves 50% slower.
  "hidden-caltrops": [
    "hex",
    (c) =>
      `<path d="M7 5l2 4-4 1zM16 13l2 4-4 1z" fill="${c}"/>` +
      `<path d="M5 15L8 18L5 21M19 3V11" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
