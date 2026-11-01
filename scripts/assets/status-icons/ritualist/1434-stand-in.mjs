import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ritualist item spells (#1434), stand-ins until the asset-designer's.
  // Ashes: a shield, more armor.
  "protective-was-kaolai": [
    "item",
    (c) => `<path d="M8 7h8v4c0 2.5-2 4-4 5-2-1-4-2.5-4-5z" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
