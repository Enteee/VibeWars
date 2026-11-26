import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2413, #2414), art #2431.
  // Enchantment: a shut eye over a bolt, as the skill's.
  meditation: [
    "enchantment",
    (c) =>
      `<path d="M4.500 8c3 4 12 4 15 0M8 11l-1 1.500M12 12.500v1.500M16 11l1 1.500" ${stroke(c, 1.6)}/>` +
      `<path d="M13 14.500l-4.500 4.500h3l-1 3 4.500-4.500h-3z" fill="${c}"/>`,
  ],
};

export default rows;
