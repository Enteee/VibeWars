import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2501), stand-ins until their art card.
  // Enchantment: a shield with a plus, ringed by a renewing arc.
  "vow-of-piety": [
    "enchantment",
    (c) =>
      `<path d="M12 6l5 2v4c0 3-2 5-5 6c-3-1-5-3-5-6V8z" ${stroke(c, 1.6)}/>` +
      `<path d="M12 9v6M9 12h6" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a ring with three ticks, each an instant enchantment.
  "signet-of-mystic-speed": [
    "skill-effect",
    (c) =>
      `<circle cx="12" cy="13.500" r="4" ${stroke(c, 1.6)}/>` +
      `<path d="M8.500 7l1 1.500M12 6v2M15.500 7l-1 1.500" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
