import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Elementalist staples (#2289), stand-ins until their art card.
  // Enchantment: a shield with a snowflake on it.
  "armor-of-frost": [
    "enchantment",
    (c) =>
      `<path d="M12 4l7 3v5c0 4-3 7-7 8c-4-1-7-4-7-8V7z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 8v8M8.5 10l7 4M15.5 10l-7 4" ${stroke(c, 1.5)}/>`,
  ],
  // Hex: a ring of chain around a flame, about to burst.
  "incendiary-bonds": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="8" ${stroke(c, 1.6)} stroke-dasharray="3 2"/>` +
      `<path d="M12 7c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a signet ring flecked with rust.
  rust: [
    "hex",
    (c) =>
      `<circle cx="12" cy="13" r="6" ${stroke(c, 1.8)}/>` +
      `<path d="M10 5h4l-1 2h-2z" ${stroke(c, 1.5)}/>` +
      `<path d="M9 12h.01M14 15h.01M12 10h.01M15 12h.01" ${stroke(c, 2.4)}/>`,
  ],
};

export default rows;
