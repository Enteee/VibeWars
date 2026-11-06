import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2479), stand-ins until their art card.
  // Shout: an arrow rising from the ground, the fallen brought back stronger.
  "we-shall-return": ["shout", (c) => `<path d="M7 19h10M12 16V6M9 9l3-3 3 3" ${stroke(c, 2.2)}/>`],
};

export default rows;
