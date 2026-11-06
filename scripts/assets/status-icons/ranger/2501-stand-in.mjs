import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2501), stand-ins until their art card.
  // Stance: speed lines behind a lightning bolt.
  "storms-embrace": [
    "stance",
    (c) =>
      `<path d="M15 5l-5 8h4l-2 6 6-9h-4z" fill="${c}"/>` +
      `<path d="M4 10h4M5 13h4M6 16h4" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
