import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Dervish staples (#2207, #2217, #1604), art #2261: each matches its skill icon.
  // Stance: three fast slashes, it attacks 25% faster.
  "pious-fury": ["stance", (c) => `<path d="M5 18L13 6M9 19L17 7M13 20L20 9" ${stroke(c, 2)}/>`],
  // Enchantment: a heart with angry brows, more Health and softer blows from the weak.
  "intimidating-aura": [
    "enchantment",
    (c) =>
      `<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" ${stroke(c, 1.8)}/>` +
      `<path d="M7.5 9.5L11 11.5V10ZM16.5 9.5L13 11.5V10Z" fill="${c}"/>`,
  ],
  // Enchantment: a bolt beside an hourglass, energy again when it ends.
  "eremites-zeal": [
    "enchantment",
    (c) =>
      `<path d="M10 3.5L4 13H8.5L7 20.5L13 11H8.5Z" fill="${c}"/>` +
      `<path d="M15 5H20L15 19H20Z" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a mouth stitched shut, no spell in or out.
  "vow-of-silence": [
    "enchantment",
    (c) =>
      `<path d="M3.5 12C6.5 7 17.5 7 20.5 12C17.5 17 6.5 17 3.5 12Z" ${stroke(c, 1.8)}/>` +
      `<path d="M8 9.5V14.5M12 8.8V15.2M16 9.5V14.5" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a shield with a drop on it, armor and regeneration while afflicted.
  conviction: [
    "enchantment",
    (c) =>
      `<path d="M12 3.5l7 2.5v5.5c0 4.5-3.5 7.5-7 9-3.5-1.5-7-4.5-7-9V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 8.5c1.6 2.2 2.4 3.4 2.4 4.6a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.4 2.4-4.6z" fill="${c}"/>`,
  ],
};

export default rows;
