import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Sacrifice, crits, signet echoes and pulses (#2275), stand-ins until their art card.
  // A drop with a spark over it: Energy for each sacrifice.
  masochism: [
    "enchantment",
    (c) =>
      `<path d="M12 9c-2 2.8-3 4.2-3 5.6a3 3 0 0 0 6 0c0-1.4-1-2.8-3-5.6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 3l-1.5 3h3L12 9" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
