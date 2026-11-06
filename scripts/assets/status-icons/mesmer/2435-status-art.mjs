import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2367, #2428, #2432), art #2435.
  // Hex: a yoke with a weight at each end, as the skill's.
  "shared-burden": [
    "hex",
    (c) =>
      `<path d="M12 6v2.500M8 8.500h8" ${stroke(c, 1.5)}/>` +
      `<path d="M7.500 8.500v2M16.500 8.500v2" ${stroke(c, 1.4)}/>` +
      `<path d="M6 10.500h3l.5 5h-4zM15 10.500h3l.5 5h-4z" fill="${c}"/>`,
  ],
};

export default rows;
