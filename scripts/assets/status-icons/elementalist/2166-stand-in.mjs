import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Elementalist staples (#2166), a stand-in until its art card.
  // Hex: ice bars over a foot, a crack under it.
  "teinais-prison": [
    "hex",
    (c) => `<path d="M7 5v11M12 5v11M17 5v11M5 16h14M9 19l2-2 2 2 2-2" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
