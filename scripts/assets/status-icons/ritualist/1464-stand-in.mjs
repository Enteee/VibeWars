import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ritualist item spells 2 (#1464), stand-ins until the asset-designer's.
  // Ashes: a bar raised, more maximum Energy.
  "mighty-was-vorizun": [
    "item",
    (c) => `<path d="M9 16V9M15 16V9M7 11l5-4 5 4" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
