import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2447), art #2456.
  // Hex: a cracked coal with a flame tip, as the skill's.
  "smoldering-embers": [
    "hex",
    (c) =>
      `<path d="M7.500 16.500L7 14L8.500 12L10.500 12.800L13.500 11.500L16 12.500L17 14L16.500 16.500Z" ${stroke(c, 1.4)}/>` +
      `<path d="M9.500 17L11 14.500L12.500 16L14 14" ${stroke(c, 1.1)}/>` +
      `<path d="M12 10.500C10.500 9 12 8 11.500 6.500C13.500 7.500 13.500 9 12 10.500Z" ${stroke(c, 1.2)}/>`,
  ],
};

export default rows;
