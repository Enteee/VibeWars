import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // "The next spell fails" hexes (#1475), stand-ins until the asset-designer's.
  // Hex: a struck-through spark with an arrow down, a spell at a foe fails.
  guilt: [
    "hex",
    (c) =>
      `<path d="M12 4v8M8 8h8" ${stroke(c, 2)}/><path d="M5 5l14 14" ${stroke(c, 1.8)}/>` +
      `<path d="M12 15v5M9.5 17.5L12 20l2.5-2.5" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
