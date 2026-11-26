import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2453), art #2465.
  // Enchantment: a faceted bust, as the skill's.
  "stoneflesh-aura": [
    "enchantment",
    (c) =>
      `<path d="M12 5L14.500 6.500V9.500L12 11L9.500 9.500V6.500Z" ${stroke(c, 1.4)}/>` +
      `<path d="M7 18V15.500L10 13.500H14L17 15.500V18Z" ${stroke(c, 1.4)}/>`,
  ],
  // Hex: a crystal between two cuffs, as the skill's.
  "icy-shackles": [
    "hex",
    (c) =>
      `<path d="M12 5.500L15 12L12 18.500L9 12Z" ${stroke(c, 1.5)}/>` +
      `<circle cx="6.500" cy="12" r="1.600" ${stroke(c, 1.3)}/><circle cx="17.500" cy="12" r="1.600" ${stroke(c, 1.3)}/>`,
  ],
  // Glyph: a rune diamond with speed streaks, as the skill's.
  "glyph-of-swiftness": [
    "glyph",
    (c) =>
      `<path d="M14.500 6.500L18 10.500L14.500 14.500L11 10.500Z" ${stroke(c, 1.5)}/>` +
      `<path d="M8 9H10.500M8 12H10.500" ${stroke(c, 1.4)}/>`,
  ],
  // Skill effect: a sagging dumbbell over a ground ring, as the skill's.
  "ward-of-weakness": [
    "skill-effect",
    (c) =>
      `<ellipse cx="12" cy="16.500" rx="5.500" ry="2" ${stroke(c, 1.3)}/>` +
      `<path d="M8.500 9Q12 12.500 15.500 9M7.500 7V11M16.500 7V11" ${stroke(c, 1.5)}/>`,
  ],
};

export default rows;
