import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Frigid Armor, Stone Sheath (#2373), stand-ins until their art card.
  // Enchantment: a shield with a snowflake on it, no flame gets in.
  "frigid-armor": [
    "enchantment",
    (c) =>
      `<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 8v8M8.5 10l7 4M15.5 10l-7 4" ${stroke(c, 1.4)}/>`,
  ],
  // Enchantment: a stone slab around a figure, no blow cuts through.
  "stone-sheath": [
    "enchantment",
    (c) =>
      `<path d="M6 4h12v16H6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 7v3M9 12h6M12 10v6" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
