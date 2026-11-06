import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2501), stand-ins until their art card.
  // Stance: speed lines behind a lightning bolt.
  "storms-embrace": [
    "stance",
    (c) =>
      `<path d="M14 4l-5 9h4l-2 7 6-10h-4z" fill="${c}"/>` +
      `<path d="M3 10h4M4 14h4M3 18h4" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
