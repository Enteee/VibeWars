import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Minion care (#1986), stand-ins until their art card.
  // Skill effect: a plus over a rising line, the minion's regeneration.
  "veratas-sacrifice": [
    "skill-effect",
    (c) =>
      `<path d="M12 4v8M8 8h8" ${stroke(c, 2.4)}/>` +
      `<path d="M5 19l5-3 4 2 5-4" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: two linked rings, the hit shared with a minion.
  "dark-bond": [
    "enchantment",
    (c) =>
      `<circle cx="9" cy="12" r="5" ${stroke(c, 2)}/>` +
      `<circle cx="15" cy="12" r="5" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a jagged spine, a horror waiting in the bones.
  "jagged-bones": [
    "enchantment",
    (c) =>
      `<path d="M12 3v18" ${stroke(c, 2.2)}/>` +
      `<path d="M8 6l4 2 4-2M7 11l5 2 5-2M8 16l4 2 4-2" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
