import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2367, #2428, #2432), art #2435.
  // Enchantment: an upright sword inside a laurel, as the skill's.
  "strength-of-honor": [
    "enchantment",
    (c) =>
      `<path d="M12 4l1.800 2.500V14h-3.600V6.500z" fill="${c}"/>` +
      `<path d="M8.500 14h7M12 14v4" ${stroke(c, 1.7)}/>` +
      `<path d="M6.500 7c-1.500 4.500.5 8 4 10.500M17.500 7c1.500 4.500-.5 8-4 10.500" ${stroke(c, 1.5)}/>`,
  ],
  // Enchantment: a scabbard with a belt and a plus cut in it, as the skill's.
  "life-sheath": [
    "enchantment",
    (c) =>
      `<path d="M9.500 4h5v10.500L12 19l-2.500-4.500z" ${stroke(c, 1.6)}/>` +
      `<path d="M7.500 7.500h9M12 10.500v4M10 12.500h4" ${stroke(c, 1.5)}/>`,
  ],
  // Enchantment: a hex diamond in a U-turn arrow, as the skill's.
  "reverse-hex": [
    "enchantment",
    (c) =>
      `<path d="M12 9.500l2.500 2.500-2.500 2.500-2.500-2.500z" fill="${c}"/>` +
      `<path d="M18 12a6 6 0 1 1-6-6M9.500 3.500l3 2.500-3 2.500" ${stroke(c, 1.7)}/>`,
  ],
  // Enchantment: a shield with a dashed ring in its face, as the skill's.
  "pensive-guardian": [
    "enchantment",
    (c) =>
      `<path d="M12 4l6 2.200V12c0 3.500-3 6-6 7.500-3-1.500-6-4-6-7.500V6.200z" ${stroke(c, 1.7)}/>` +
      `<circle cx="12" cy="11.500" r="3" ${stroke(c, 1.4)} stroke-dasharray="2.200 1.800"/>`,
  ],
};

export default rows;
