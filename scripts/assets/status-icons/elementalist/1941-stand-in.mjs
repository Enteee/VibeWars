import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Glyphs (#1941), stand-ins until their art card.
  // Glyph: a diamond of the four elements with an arrow up, boosted.
  "glyph-of-elemental-power": [
    "glyph",
    (c) =>
      `<path d="M12 4l8 8-8 8-8-8z" ${stroke(c, 2)}/>` +
      `<path d="M12 16V9M9 11.5l3-3 3 3" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
