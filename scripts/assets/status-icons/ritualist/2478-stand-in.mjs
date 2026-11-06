import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2478), stand-ins until their art card.
  // Skill effect: a held bundle under a raised bar, more while it is held.
  empowerment: [
    "skill-effect",
    (c) => `<path d="M10 18h8v-5h-8zM14 13V7M11 10l3-3 3 3" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: a totem wound round by a turning line, cheaper rituals.
  "soul-twisting": [
    "skill-effect",
    (c) =>
      `<path d="M12 18V9h4v9" ${stroke(c, 2)}/>` +
      `<path d="M8 12a6 6 0 0 1 12 0M20 12l-1.5-2M20 12l-2 1" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
