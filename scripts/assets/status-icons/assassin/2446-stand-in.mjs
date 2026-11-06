import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Dropped leftovers (#2446), stand-ins until their art card.
  // Hex: a drop below a dashed line, a step and a wound at half Health.
  "augury-of-death": [
    "hex",
    (c) =>
      `<path d="M7 11h10" ${stroke(c, 1.6)} stroke-dasharray="2 1.6"/>` +
      `<path d="M12 12.5c1.8 2.2 2.6 3.5 2.6 4.6a2.6 2.6 0 0 1-5.2 0c0-1.1.8-2.4 2.6-4.6z" fill="${c}"/>` +
      `<path d="M12 5v3.5" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
