import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Winter's Embrace (#2374), a stand-in until its art card.
  // Hex: a snowflake over a slowed foot line.
  "winters-embrace": [
    "hex",
    (c) =>
      `<path d="M12 3v12M7 6l10 6M17 6 7 12" ${stroke(c, 1.8)}/>` +
      `<path d="M5 20h14" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
