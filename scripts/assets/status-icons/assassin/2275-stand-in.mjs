import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Sacrifice, crits, signet echoes and pulses (#2275), stand-ins until their art card.
  // A dagger with a star by its tip: daggers crit.
  "way-of-the-assassin": [
    "stance",
    (c) =>
      `<path d="M6 18l9-9M15 9l2-4-4 2" ${stroke(c, 1.8)}/>` +
      `<path d="M18 13v4M16 15h4" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
