import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2414), stand-ins until their art card.
  // Enchantment: an eye, and a bar across what strikes at it.
  "sympathetic-visage": [
    "enchantment",
    (c) =>
      `<path d="M6 12q6-6 12 0q-6 6-12 0z" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="12" r="1.800" ${stroke(c, 1.6)}/>` +
      `<path d="M8 17.500h8" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: a signet's square, and a quick turn round it.
  "mantra-of-inscriptions": [
    "stance",
    (c) =>
      `<path d="M9 9h6v6h-6z" ${stroke(c, 1.8)}/>` +
      `<path d="M7 7.500a6.500 6.500 0 0 1 10 0M17 16.500a6.500 6.500 0 0 1-10 0" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
