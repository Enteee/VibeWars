import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2413, #2414), art #2431.
  // Enchantment: a mask with a falling chevron, as the skill's.
  "sympathetic-visage": [
    "enchantment",
    (c) =>
      `<path d="M5.500 5.500h13V12c0 4-3 6.500-6.500 6.500S5.500 16 5.500 12z" ${stroke(c, 1.7)}/>` +
      `<path d="M8.500 9.500l2.500 1.200M15.500 9.500l-2.500 1.200M9.500 14l2.500 2.500 2.500-2.500" ${stroke(c, 1.5)}/>`,
  ],
  // Stance: a signet's seal inside a turning arrow, as the skill's.
  "mantra-of-inscriptions": [
    "stance",
    (c) =>
      `<rect x="9.500" y="9.500" width="5" height="5" ${stroke(c, 1.5)}/>` +
      `<path d="M12 5a7 7 0 0 1 7 7M12 19a7 7 0 0 1-7-7" ${stroke(c, 1.6)}/>` +
      `<path d="M21 9l-2 3-3-2z" fill="${c}"/>`,
  ],
};

export default rows;
