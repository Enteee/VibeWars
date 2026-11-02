import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Warrior conditions (#2096), stand-ins until their art card.
  // Shout: a chevron running left, over a cross for the fallen.
  retreat: [
    "shout",
    (c) =>
      `<path d="M17 10H7.5M11 6l-4 4 4 4" ${stroke(c, 2.5)}/>` +
      `<path d="M15 16v6M12.5 18h5" ${stroke(c, 1.6)}/>`,
  ],
  // Skill: a shield with a ring around it, held for those beside you.
  "protectors-defense": [
    "skill-effect",
    (c) =>
      `<path d="M12 7l4 1.5v3c0 2.5-2 4-4 5-2-1-4-2.5-4-5v-3z" ${stroke(c, 2)}/>` +
      `<circle cx="12" cy="12" r="8.5" ${stroke(c, 1.4)}/>`,
  ],
  // Skill: the shield alone, as an ally beside the bearer wears it.
  "protectors-defense-block": [
    "skill-effect",
    (c) => `<path d="M12 5l5 2v4c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7V7z" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
