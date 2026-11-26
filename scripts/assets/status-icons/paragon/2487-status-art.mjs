import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2479), art #2487.
  // Shout: a pennant on a pole with a chevron rising in it, as the skill's.
  "we-shall-return": [
    "shout",
    (c) =>
      `<path d="M8 19V5" ${stroke(c, 2)}/>` +
      `<path d="M8 6h9l-2.500 3L17 12H8z" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
