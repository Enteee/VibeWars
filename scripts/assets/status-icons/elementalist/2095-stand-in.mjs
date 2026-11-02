import { stroke } from "../../icon-kit.mjs";

const SHIELD = (/** @type {string} */ c) =>
  `<path d="M6 4h12v7c0 4-3 7-6 9-3-2-6-5-6-9z" ${stroke(c, 2)}/>`;

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Elementalist auras (#2095), stand-ins until their art card.
  // Enchantment: a horseshoe magnet in the shield, one block that strikes back.
  "magnetic-aura": [
    "enchantment",
    (c) => SHIELD(c) + `<path d="M9 7v4a3 3 0 0 0 6 0V7" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a swirl, projectiles turned and Health regained.
  "swirling-aura": [
    "enchantment",
    (c) =>
      `<path d="M12 12a2 2 0 1 1 2-2c0 3-2 5-5 5a5 5 0 0 1-5-5 7 7 0 0 1 7-7 8 8 0 0 1 8 8 9 9 0 0 1-9 9" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a magnet over a bar in the shield, the next attack blocked.
  "magnetic-surge": [
    "enchantment",
    (c) => SHIELD(c) + `<path d="M9 6.5v3a3 3 0 0 0 6 0v-3M9 15h6" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: stone slivers flying off a shield.
  "sliver-armor": [
    "enchantment",
    (c) =>
      SHIELD(c) +
      `<path d="M12 7v6M9 9l1.5 2.5M15 9l-1.5 2.5M3 6l2 1M21 6l-2 1" ${stroke(c, 1.5)}/>`,
  ],
};

export default rows;
