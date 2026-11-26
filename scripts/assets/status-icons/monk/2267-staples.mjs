import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Monk staples (#2189, #2190), art #2267: each matches its skill icon.
  // Enchantment: a shield with a spell star, spells cannot reach you.
  "spell-shield": [
    "enchantment",
    (c) =>
      `<path d="M12 3.5l7 2.5v5.5c0 4.5-3.5 7.5-7 9-3.5-1.5-7-4.5-7-9V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 8L13.4 11L16.5 12L13.4 13L12 16.5L10.6 13L7.5 12L10.6 11Z" fill="${c}"/>`,
  ],
  // Effect: a dashed ring, an arrow and a filled shield, armor for the hex removed.
  "convert-hexes": [
    "skill-effect",
    (c) =>
      `<circle cx="5.5" cy="12" r="3.3" ${stroke(c, 1.6)} stroke-dasharray="2.4 1.8"/>` +
      `<path d="M10 12H12" ${stroke(c, 1.8)}/>` +
      `<path d="M17.5 5l4 1.6v4.6c0 3-1.8 5.2-4 6.4-2.2-1.2-4-3.4-4-6.4V6.6z" fill="${c}"/>`,
  ],
  // Enchantment: a shield with two chevrons down, every hit a little less.
  "shield-of-absorption": [
    "enchantment",
    (c) =>
      `<path d="M12 3.5l7 2.5v5.5c0 4.5-3.5 7.5-7 9-3.5-1.5-7-4.5-7-9V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M8.5 9L12 12L15.5 9M8.5 13L12 16L15.5 13" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a skull under a halo, the fatal blow turned to a heal.
  "divine-intervention": [
    "enchantment",
    (c) =>
      `<ellipse cx="12" cy="4.5" rx="5" ry="1.8" ${stroke(c, 1.6)}/>` +
      `<path d="M6.5 12C6.5 8 9 7 12 7s5.5 1 5.5 5c0 2-.8 3-2 3.6V19h-7v-3.4c-1.2-.6-2-1.6-2-3.6z" ${stroke(c, 1.8)}/>` +
      `<circle cx="9.7" cy="12" r="1.3" fill="${c}"/><circle cx="14.3" cy="12" r="1.3" fill="${c}"/>`,
  ],
  // Enchantment: a hit burst, an arrow and a plus, healed whenever hurt.
  "healing-hands": [
    "enchantment",
    (c) =>
      `<path d="M6.5 6l1.2 3.5 3.6-.8-2 3.3 2.7 2.6-3.7.2-.8 3.7-1.9-3.2-3.5 1.2 1.6-3.4L2 9l3.7.2z" fill="${c}"/>` +
      `<path d="M12 12h2" ${stroke(c, 1.6)}/>` +
      `<path d="M18 7.5v9M13.5 12h9" ${stroke(c, 2.6)}/>`,
  ],
  // Enchantment: a shield over a ground bar, a bolt beside it, the attacker knocked down.
  "shield-of-judgment": [
    "enchantment",
    (c) =>
      `<path d="M8.5 3.5l5 1.8v4.2c0 3.2-2.4 5.4-5 6.5-2.6-1.1-5-3.3-5-6.5V5.3z" ${stroke(c, 1.8)}/>` +
      `<path d="M19 3l-4 7h3.5l-1.5 6 5-8h-3.5z" fill="${c}"/>` +
      `<path d="M2 21h20" ${stroke(c, 2.6)}/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2421). */
const fits = {
  "healing-hands": [0.94, 0],
  "shield-of-judgment": [0.96, -2],
};

export default fitRows(rows, fits);
