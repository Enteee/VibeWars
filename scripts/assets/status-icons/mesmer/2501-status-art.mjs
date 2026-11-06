import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2501), art #2517.
  // Hex: a drop of degeneration under a looping arrow, back as it ends.
  "recurring-insecurity": [
    "hex",
    (c) =>
      `<path d="M12 10c2 2.500 2.600 3.600 2.600 4.900a2.600 2.600 0 0 1-5.200 0c0-1.300.6-2.400 2.600-4.900z" fill="${c}"/>` +
      `<path d="M8 9a5 5 0 0 1 8 0M16 9l-.3-2.200M16 9l-2.200.3" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
