import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Sacrifice, crits, signet echoes and pulses (#2275), stand-ins until their art card.
  // A jagged line through a circle: Health lost each second.
  agony: [
    "skill-effect",
    (c) =>
      `<circle cx="12" cy="12" r="6" ${stroke(c, 1.8)}/>` +
      `<path d="M6 12l3-3 3 6 3-6 3 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
