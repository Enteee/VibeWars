import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Necromancer mechanics (#2321), art #2397.
  // Hex: a drop over three bursting rays, bile that bursts as it ends.
  "rising-bile": [
    "hex",
    (c) =>
      `<path d="M12 4c2.500 3 3.500 5 3.500 6.500a3.500 3.500 0 0 1-7 0C8.500 9 9.500 7 12 4z" ${stroke(c, 1.6)}/>` +
      `<path d="M12 16v4M7.500 15 5.500 18M16.500 15l2 3" ${stroke(c, 1.5)}/>`,
  ],
};

export default rows;
