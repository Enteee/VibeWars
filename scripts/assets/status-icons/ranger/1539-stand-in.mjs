import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ranger staples (#1539), stand-ins until the asset-designer's.
  // Stance: a circling arc, blocks and hurts who is adjacent.
  "whirling-defense": [
    "stance",
    (c) => `<path d="M17 8a6 6 0 1 0 1 6M18 5v4h-4" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
