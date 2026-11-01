import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Crowd punishers (#1501), stand-ins until the asset-designer's.
  // Hex: a broken ring round a burst, a skill used interrupts those near.
  panic: [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="7" ${stroke(c, 1.6)} stroke-dasharray="3 2.5"/>` +
      `<path d="M12 8v8M8 12h8M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
