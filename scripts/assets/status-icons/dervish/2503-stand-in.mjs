import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2503), stand-ins until their art card.
  // Enchantment: a veil with thorns along its hem.
  "veil-of-thorns": [
    "enchantment",
    (c) =>
      `<path d="M8 8h8v6l-4 2-4-2z" ${stroke(c, 1.6)}/>` +
      `<path d="M9 17l-1 1M12 17v1.500M15 17l1 1" ${stroke(c, 1.4)}/>`,
  ],
  // Enchantment: a breastplate with a minus.
  "armor-of-sanctity": [
    "enchantment",
    (c) =>
      `<path d="M8 8h8l-1 7h-6z" ${stroke(c, 1.6)}/>` +
      `<path d="M10 11.500h4" ${stroke(c, 1.6)}/>`,
  ],
  // Stance: a ring held steady, a dash through it.
  "pious-concentration": [
    "stance",
    (c) =>
      `<circle cx="12" cy="13" r="3.500" ${stroke(c, 1.6)}/>` +
      `<path d="M8 13h8" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: three drops passing outward.
  "grenths-fingers": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="1.800" fill="${c}"/>` +
      `<path d="M8 9l-1.500-1M16 9l1.500-1M12 15.500v1.500" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
