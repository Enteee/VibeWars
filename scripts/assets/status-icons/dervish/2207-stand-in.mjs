import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Dervish staples (#2207), stand-ins until their art card.
  // Enchantment: a heart grown larger, a foe's blow turned off it.
  "intimidating-aura": [
    "enchantment",
    (c) =>
      `<path d="M12 19l-6-6a4 4 0 0 1 6-5 4 4 0 0 1 6 5z" ${stroke(c, 2)}/>` +
      `<path d="M3 5l4 4M3 9l4-4" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: an energy bolt waiting under an hourglass.
  "eremites-zeal": [
    "enchantment",
    (c) =>
      `<path d="M13 4l-4 8h4l-2 8 6-10h-4l2-6z" ${stroke(c, 2)}/>` +
      `<path d="M4 5h4M4 19h4M5 5l2 7-2 7" ${stroke(c, 1.4)}/>`,
  ],
  // Enchantment: a mouth sealed by a bar, no spell in or out.
  "vow-of-silence": [
    "enchantment",
    (c) =>
      `<path d="M6 12c2-3 10-3 12 0-2 3-10 3-12 0z" ${stroke(c, 2)}/>` +
      `<path d="M5 6l14 12" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
