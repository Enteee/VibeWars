import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Corpus skills on existing mechanics (#2499), stand-ins until their art card.
  // Enchantment: two flames side by side.
  "double-dragon": [
    "enchantment",
    (c) =>
      `<path d="M8.5 17c-2 0-3-1.5-3-3 0-2.5 3-4 3-7 1 2 3 3.5 3 7 0 1.5-1 3-3 3z" ${stroke(c, 1.5)}/><path d="M15.5 17c-2 0-3-1.5-3-3 0-2.5 3-4 3-7 1 2 3 3.5 3 7 0 1.5-1 3-3 3z" ${stroke(c, 1.5)}/>`,
  ],
  // Ward: heat lines rising from the ground.
  "teinais-heat": [
    "skill-effect",
    (c) =>
      `<path d="M6 18h12" ${stroke(c, 1.8)}/><path d="M9 15c-1-2 1-3 0-6M12 15c-1-2 1-3 0-6M15 15c-1-2 1-3 0-6" ${stroke(c, 1.5)}/>`,
  ],
  // Glyph: a flame on a spell mark.
  "glyph-of-immolation": [
    "glyph",
    (c) =>
      `<path d="M12 17c-2.5 0-4-1.8-4-4 0-3 4-5 4-8 1.3 2.5 4 4.5 4 8 0 2.2-1.5 4-4 4z" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
