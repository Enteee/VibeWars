import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Sacrifice, crits, signet echoes and pulses (#2275), stand-ins until their art card.
  // A scythe blade over a drop: scythe hits steal Health.
  "grenths-aura": [
    "enchantment",
    (c) =>
      `<path d="M6 6c5-2 10 0 12 5-4-2-8-2-12-5z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 13c-1.5 2-2.2 3-2.2 4a2.2 2.2 0 0 0 4.4 0c0-1-.7-2-2.2-4z" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
