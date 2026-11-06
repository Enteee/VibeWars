import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Counts and charges (#2438), stand-ins until their art card.
  // Glyph: two plus marks over a short rune line, the next two spells heal.
  "glyph-of-restoration": [
    "glyph",
    (c) =>
      `<path d="M8.5 4.5v5M6 7h5M15.5 4.5v5M13 7h5" ${stroke(c, 1.8)}/>` +
      `<path d="M10 14h4" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
