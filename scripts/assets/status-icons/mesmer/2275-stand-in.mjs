import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Sacrifice, crits, signet echoes and pulses (#2275), stand-ins until their art card.
  // A keystone with two stones beside it: the foes next to the target.
  "keystone-signet": [
    "skill-effect",
    (c) =>
      `<path d="M9 6h6l-1 8h-4z" ${stroke(c, 1.8)}/>` +
      `<path d="M4 16h4M16 16h4" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
