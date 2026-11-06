import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2479), art #2487.
  // Hex: a hooded cloak with a struck ring, as the skill's.
  "shadow-shroud": [
    "hex",
    (c) =>
      `<path d="M12 7.500C10 7.500 9 11 8.500 16H15.500C15 11 14 7.500 12 7.500Z" ${stroke(c, 1.7)}/>` +
      `<path d="M10.500 12l3 2.500" ${stroke(c, 1.5)}/>`,
  ],
};

export default rows;
