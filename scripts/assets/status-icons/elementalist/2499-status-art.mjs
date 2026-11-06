import { fitRows, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Corpus skills on existing mechanics (#2499), art #2516.
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
  // Glyph: a flame on a sigil ring.
  "glyph-of-immolation": [
    "glyph",
    (c) =>
      `<circle cx="12" cy="12" r="8" ${stroke(c, 1.4)} stroke-dasharray="2.500 2"/><path d="M12 17c-2-0-3-1.500-3-3 0-2.200 3-3.500 3-6 1 2 3 3.300 3 6 0 1.500-1 3-3 3z" ${stroke(c, 1.5)}/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2404). */
const fits = { "glyph-of-immolation": [0.5, 2.5] };

export default fitRows(rows, fits);
