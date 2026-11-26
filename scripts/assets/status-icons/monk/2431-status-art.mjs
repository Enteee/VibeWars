import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2413, #2414), art #2431.
  // Hex: a blade and a bolt, as the skill's.
  "defenders-zeal": [
    "hex",
    (c) =>
      `<path d="M7 7.500l4 4M6.500 11l3-3" ${stroke(c, 1.7)}/>` +
      `<path d="M15 9l-3.500 5h2.500l-.800 3.500 3.500-5h-2.500z" fill="${c}"/>`,
  ],
};

export default rows;
