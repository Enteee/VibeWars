import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2501), stand-ins until their art card.
  // Hex: a drop of degeneration under a looping arrow, back as it ends.
  "recurring-insecurity": [
    "hex",
    (c) =>
      `<path d="M12 9c2 3 3 4.300 3 5.800a3 3 0 0 1-6 0c0-1.500 1-2.800 3-5.800z" fill="${c}"/>` +
      `<path d="M6 8a7 7 0 0 1 12 0M18 8l-.5-3M18 8l-3 .5" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
