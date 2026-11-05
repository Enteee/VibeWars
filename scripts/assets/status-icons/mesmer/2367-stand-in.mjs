import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2367), a stand-in until its art card.
  // Hex: a weight hung from a bar, everything slower.
  "shared-burden": [
    "hex",
    (c) =>
      `<path d="M5 6h14M12 6v4" ${stroke(c, 1.8)}/>` +
      `<path d="M8 19l1.5-9h5L16 19z" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
