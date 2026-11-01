import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Elementalist self-buffs (#1984), stand-ins until their art card.
  // Enchantment: a flame, a snowflake, a bolt over a blade.
  "conjure-flame": [
    "enchantment",
    (c) =>
      `<path d="M12 3c3 3.5 4 6.5 2.6 9.5-1.2 2-4 2-5.2 0C8 9.5 9.5 6.5 12 3z" ${stroke(c, 1.8)}/>` +
      `<path d="M5 20l14-4" ${stroke(c, 2.2)}/>`,
  ],
  "conjure-frost": [
    "enchantment",
    (c) =>
      `<path d="M12 3v12M7 6l10 6M17 6L7 12" ${stroke(c, 1.8)}/>` +
      `<path d="M5 20l14-4" ${stroke(c, 2.2)}/>`,
  ],
  "conjure-lightning": [
    "enchantment",
    (c) =>
      `<path d="M13 3l-4 7h5l-3 6" ${stroke(c, 1.8)}/>` +
      `<path d="M5 20l14-4" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a bolt over rising pips, and a heart it costs.
  "ether-prodigy": [
    "enchantment",
    (c) =>
      `<path d="M10 3l-3 6h4l-2 5" ${stroke(c, 1.8)}/>` +
      `<path d="M15 20v-4M18 20v-7" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a bolt in a ring, renewed.
  "ether-renewal": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="8" ${stroke(c, 1.8)}/>` +
      `<path d="M13 6l-3 6h4l-2 5" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: four elements, one diamond each corner.
  "elemental-attunement": [
    "enchantment",
    (c) =>
      `<path d="M12 3l3 3-3 3-3-3zM12 15l3 3-3 3-3-3zM6 9l3 3-3 3-3-3zM18 9l3 3-3 3-3-3z" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
