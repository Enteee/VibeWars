import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Protection staples (#2187), stand-ins until their art card.
  // Enchantment: an arrow bent back on itself, the damage sent home.
  "reversal-of-damage": [
    "enchantment",
    (c) => `<path d="M16 6v7a4 4 0 0 1-8 0V8M11 11L8 8l-3 3" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a dashed ring with a tick, a hex lost on the beat.
  "spotless-mind": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="7" ${stroke(c, 2)} stroke-dasharray="3 2.5"/>` +
      `<path d="M12 8v4h3" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a drop with a tick, a condition lost on the beat.
  "spotless-soul": [
    "enchantment",
    (c) =>
      `<path d="M12 4c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z" ${stroke(c, 2)}/>` +
      `<path d="M12 10v3h2.5" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a shield with a plus, damage turned to healing.
  "mark-of-protection": [
    "enchantment",
    (c) =>
      `<path d="M6 5h12v6c0 4-3 6.5-6 8-3-1.5-6-4-6-8z" ${stroke(c, 2)}/>` +
      `<path d="M12 8.5v6M9 11.5h6" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a shield on a chain link, held while maintained.
  "protective-bond": [
    "enchantment",
    (c) =>
      `<path d="M9 5h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M4 14a2.5 2.5 0 0 1 5 0v3a2.5 2.5 0 0 1-5 0z" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
