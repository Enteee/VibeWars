import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Winter's Embrace (#2374), art #2398.
  // Hex: a snowflake over two footprints.
  "winters-embrace": [
    "hex",
    (c) =>
      `<path d="M12 2v11M7 4l10 7M17 4L7 11" ${stroke(c, 1.8)}/>` +
      `<path d="M5 22c-1.200 0-1.500-3-.500-5 1-1.500 3-1 3 1.500S6.300 22 5 22zM15 22c-1.200 0-1.500-3-.500-5 1-1.500 3-1 3 1.500S16.300 22 15 22z" fill="${c}"/>`,
  ],
};

export default rows;
