import { stroke } from "../../icon-kit.mjs";

const SHIELD = (/** @type {string} */ c) =>
  `<path d="M6 4h12v7c0 4-3 7-6 9-3-2-6-5-6-9z" ${stroke(c, 2)}/>`;

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Monk staples (#2190), stand-ins until their art card.
  // Enchantment: a shield with a minus, every hit a little less.
  "shield-of-absorption": ["enchantment", (c) => SHIELD(c) + `<path d="M9 11h6" ${stroke(c, 2)}/>`],
  // Enchantment: a plus under a halo, the fatal blow turned to a heal.
  "divine-intervention": [
    "enchantment",
    (c) =>
      `<ellipse cx="12" cy="5" rx="5" ry="2" ${stroke(c, 1.6)}/>` +
      `<path d="M12 9v11M6.5 14.5h11" ${stroke(c, 2.6)}/>`,
  ],
  // Enchantment: two open hands under a plus, healed whenever hurt.
  "healing-hands": [
    "enchantment",
    (c) =>
      `<path d="M12 3v7M8.5 6.5h7" ${stroke(c, 2.2)}/>` +
      `<path d="M3 13l4 7h4M21 13l-4 7h-4" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a shield over a fallen bar, the attacker knocked down.
  "shield-of-judgment": [
    "enchantment",
    (c) => SHIELD(c) + `<path d="M9 9l6 4M2 22h20" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
