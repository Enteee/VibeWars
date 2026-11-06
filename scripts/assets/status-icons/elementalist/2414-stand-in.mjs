import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2414), stand-ins until their art card.
  // Enchantment: a flame over a run chevron.
  "flame-djinns-haste": [
    "enchantment",
    (c) =>
      `<path d="M12 6q4 4 1.500 8q-1.500 1.500-3 0q-2-3 1.500-8z" ${stroke(c, 1.6)}/>` +
      `<path d="M8 16l4 3 4-3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
