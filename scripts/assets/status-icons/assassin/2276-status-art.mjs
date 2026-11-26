import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Assassin status art (#2276).
  // Enchantment: an arrow turning back on itself, the step you return by.
  recall: [
    "enchantment",
    (c) =>
      `<path d="M8 7h7a4.5 4.5 0 0 1 0 9H8M11 13l-3 3 3 3" ${stroke(c, 2)}/>` +
      `<circle cx="7" cy="7" r="1.8" fill="${c}"/>`,
  ],
  // Hex: a domed cage of bars on its floor.
  "dark-prison": [
    "hex",
    (c) =>
      `<path d="M5 20V11a7 7 0 0 1 14 0v9M4 20h16" ${stroke(c, 1.8)}/>` +
      `<path d="M9.5 5.5V20M14.5 5.5V20" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: two footprints, quick and quiet.
  "shadow-walk": [
    "stance",
    (c) =>
      `<path d="M7 20c-2.4-1-3-5-1.4-8 1.2-2 3.8-1 4 1.4.2 3-.2 5.6-2.6 6.6z" fill="${c}"/>` +
      `<path d="M17 12c-2.4-1-3-5-1.4-8 1.2-2 3.8-1 4 1.4.2 3-.2 5.6-2.6 6.6z" fill="${c}"/>`,
  ],
  // Enchantment: a hooded figure drawn in dashes, untouchable while it lasts.
  "shadow-form": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="7" r="3" ${stroke(c, 2)} stroke-dasharray="2 2"/>` +
      `<path d="M6 20c0-5 3-8 6-8s6 3 6 8z" ${stroke(c, 2)} stroke-dasharray="2 2"/>`,
  ],
  // Hex: a figure and its dashed mirror image.
  "mirrored-stance": [
    "hex",
    (c) =>
      `<circle cx="7" cy="7" r="2.4" fill="${c}"/>` +
      `<path d="M3 19c0-4 1.6-6 4-6s4 2 4 6" ${stroke(c, 2.4)}/>` +
      `<circle cx="17" cy="7" r="2.4" ${stroke(c, 1.6)} stroke-dasharray="1.8 1.8"/>` +
      `<path d="M13 19c0-4 1.6-6 4-6s4 2 4 6" ${stroke(c, 1.8)} stroke-dasharray="2.4 2"/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2422). */
const fits = {
  "dark-prison": [0.76, -2],
  "shadow-walk": [1, 2],
  "mirrored-stance": [0.7, -1],
};

export default fitRows(rows, fits);
