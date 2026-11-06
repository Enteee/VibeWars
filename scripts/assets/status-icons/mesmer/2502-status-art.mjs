import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2502), art #2517.
  // Enchantment: a bolt beside an hourglass, Energy now, a longer recharge.
  "auspicious-incantation": [
    "enchantment",
    (c) =>
      `<path d="M10 5l-4 7h3l-1 6 5-8h-3z" fill="${c}"/>` +
      `<path d="M14 7h5M14 18h5M14.500 7l4 11M18.500 7l-4 11" ${stroke(c, 1.4)}/>`,
  ],
  // Skill effect: a crown over a chevron, elites cast with Fast Casting.
  "symbols-of-inspiration": [
    "skill-effect",
    (c) =>
      `<path d="M6 11l2-5 4 3 4-3 2 5z" fill="${c}"/>` +
      `<path d="M8 19l4-4 4 4" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
