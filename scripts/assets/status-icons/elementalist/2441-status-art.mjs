import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Counts and charges (#2373, #2438), art #2441.
  // Enchantment: a breastplate with a snowflake, as the skill's.
  "frigid-armor": [
    "enchantment",
    (c) =>
      `<path d="M6 6L9 5H15L18 6V10L16.500 11V19H7.500V11L6 10Z" ${stroke(c, 1.5)}/>` +
      `<path d="M12 8V16M8.500 10.500L15.500 14.500M15.500 10.500L8.500 14.500" ${stroke(c, 1.2)}/>`,
  ],
  // Enchantment: a slab with a blade slot, as the skill's.
  "stone-sheath": [
    "enchantment",
    (c) =>
      `<path d="M8 4H16L18.500 6.500V20H5.500V6.500Z" ${stroke(c, 1.6)}/>` +
      `<path d="M12 8V15M10 15H14M12 15V17.500" ${stroke(c, 1.5)}/>`,
  ],
  // Glyph: a rune diamond with a plus and two pips, as the skill's.
  "glyph-of-restoration": [
    "glyph",
    (c) =>
      `<path d="M12 4L16.500 8.500L12 13L7.500 8.500Z" ${stroke(c, 1.5)}/>` +
      `<path d="M12 6.500V10.500M10 8.500H14" ${stroke(c, 1.3)}/>` +
      `<circle cx="10" cy="15.500" r="1.200" fill="${c}"/><circle cx="14" cy="15.500" r="1.200" fill="${c}"/>`,
  ],
};

export default rows;
