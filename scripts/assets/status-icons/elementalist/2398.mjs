import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Winter's Embrace (#2374), art #2398.
  // Hex: a snowflake over two footprints.
  "winters-embrace": [
    "hex",
    (c) =>
      `<path d="M12 4v8M8.500 6l7 4.500M15.500 6l-7 4.500" ${stroke(c, 1.6)}/>` +
      `<ellipse cx="9.500" cy="17.500" rx="1.600" ry="2.300" fill="${c}"/>` +
      `<ellipse cx="14.500" cy="17.500" rx="1.600" ry="2.300" fill="${c}"/>`,
  ],
};

export default rows;
