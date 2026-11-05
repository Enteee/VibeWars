import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Iron Mist, Chilling Winds (#2311), stand-ins until their art card.
  // Enchantment: a shield with mist lines across it.
  "iron-mist": [
    "enchantment",
    (c) =>
      `<path d="M12 4l6 2.5v5c0 4-3 6.5-6 8-3-1.5-6-4-6-8v-5z" ${stroke(c, 1.6)}/>` +
      `<path d="M8 10h8M8 14h8" ${stroke(c, 1.4)}/>`,
  ],
  // Hex: a snowflake with a lengthening arrow: the next water hex lasts longer.
  "chilling-winds": [
    "hex",
    (c) =>
      `<path d="M10 5v10M5.7 7.5l8.6 5M5.7 12.5l8.6-5" ${stroke(c, 1.6)}/>` +
      `<path d="M13 19h7M17.5 16.5l2.5 2.5-2.5 2.5" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
