import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mesmer energy and utility (#2132), stand-ins until their art card.
  // Enchantment: a bolt in a ring that closes on itself, Energy renewed.
  "lyssas-aura": [
    "enchantment",
    (c) =>
      `<path d="M13 4l-5 9h4l-1 7 5-9h-4z" ${stroke(c, 1.8)}/>` +
      `<path d="M5 12a7 7 0 0 1 12-5M19 12a7 7 0 0 1-12 5" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: an hourglass with an arrow back, the spell ready again.
  "persistence-of-memory": [
    "enchantment",
    (c) =>
      `<path d="M7 4h10M7 20h10M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8s8 3 8 8" ${stroke(c, 1.8)}/>` +
      `<path d="M3 9l2-3 2 3" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
