import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2502), art #2517.
  // Item: an urn under a circling arrow, hexes back when it drops.
  "anguished-was-lingwah": [
    "item",
    (c) =>
      `<path d="M9 11h6l1 6a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z" ${stroke(c, 1.6)}/>` +
      `<path d="M8 8a5 5 0 0 1 8 0M16 8l-.3-2.200M16 8l-2.200.3" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
