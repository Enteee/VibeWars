import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2367, #2428, #2432), art #2435.
  // Hex: two arched clamps rising from a slab, as the skill's.
  "earthen-shackles": [
    "hex",
    (c) =>
      `<path d="M7 16h10" ${stroke(c, 2)}/>` +
      `<path d="M8 16v-3a2 2 0 0 1 4 0v3M12 16v-3a2 2 0 0 1 4 0v3" ${stroke(c, 1.5)}/>`,
  ],
  // Skill effect: a solid prism with one beam in and two out, as the skill's.
  "ether-prism": [
    "skill-effect",
    (c) =>
      `<path d="M12 6.500l4.500 9h-9z" fill="${c}"/>` +
      `<path d="M3.500 10l4 1.500M16.500 10.500l4-2.500M17 14.500h3.500" ${stroke(c, 1.5)}/>`,
  ],
  // Enchantment: a fireball with a flaring tail, as the skill's.
  "burning-speed": [
    "enchantment",
    (c) =>
      `<circle cx="16" cy="12" r="3.800" fill="${c}"/>` +
      `<path d="M12.500 8.500C10 9 7.500 7 4.500 6.500 6.500 9 6 10.500 4.500 12 6 13.500 6.500 15 4.500 17.500 7.500 17 10 15 12.500 15.500z" fill="${c}"/>`,
  ],
};

export default rows;
