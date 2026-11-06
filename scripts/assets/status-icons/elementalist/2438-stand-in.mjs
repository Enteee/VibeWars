import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Counts and charges (#2438), stand-ins until their art card.
  // Glyph: two plus marks over a rune line, the next two spells heal.
  "glyph-of-restoration": [
    "glyph",
    (c) =>
      `<path d="M8 5v6M5 8h6M16 5v6M13 8h6" ${stroke(c, 1.8)}/>` +
      `<path d="M5 17h14M8 14v6M16 14v6" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
