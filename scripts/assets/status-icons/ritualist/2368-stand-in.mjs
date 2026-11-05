import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2368), stand-ins until their art card.
  // Enchantment: a bolt between rising pips, energy regeneration.
  "spirit-channeling": [
    "enchantment",
    (c) =>
      `<path d="M13 3l-5 9h4l-2 9 6-11h-4z" fill="${c}"/>` +
      `<path d="M4 10l2-2 2 2M16 10l2-2 2 2" ${stroke(c, 1.4)}/>`,
  ],
  // Hex: a pulse wave that pays back a bolt.
  "renewing-surge": [
    "hex",
    (c) =>
      `<path d="M2 14h4l2-5 3 9 2-6h3" ${stroke(c, 1.8)}/>` +
      `<path d="M19 4l-3 5h3l-2 5" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
