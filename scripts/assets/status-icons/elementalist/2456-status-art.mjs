import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2447), art #2456.
  // Hex: a faceted coal with three sparks, as the skill's.
  "smoldering-embers": [
    "hex",
    (c) =>
      `<path d="M7.500 17L6.500 13L9 11L14.500 10.500L17 13L16.500 17Z" ${stroke(c, 1.5)}/>` +
      `<path d="M9 8.500V7M12 8V6M15 8.500V7" ${stroke(c, 1.3)}/>`,
  ],
};

export default rows;
