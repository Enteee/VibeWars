import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2367), a stand-in until its art card.
  // Hex: a weight hung from a bar, everything slower.
  "shared-burden": [
    "hex",
    (c) =>
      `<path d="M7 8h10M12 8v3" ${stroke(c, 1.8)}/>` +
      `<path d="M9.5 17l1-6h3l1 6z" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
