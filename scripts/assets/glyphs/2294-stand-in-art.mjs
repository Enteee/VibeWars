// Glyphs (#2294): the stand-ins of #2278.

import { C, stroke } from "../icon-kit.mjs";
import {
  DROP,
  HEX_RING,
  glyph,
  holyStar,
  inkFill,
  inkLine,
  ringDot,
  smallFigure,
} from "../glyph-kit.mjs";

/** @param {string} g @param {number} x @param {number} y @param {number} k */
const at = (g, x, y, k) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-12)">${g}</g>`;

/** A small ring, an enchantment, at `x`, `y`. @param {number} x @param {number} y */
const ench = (x, y) =>
  `<circle cx="${String(x)}" cy="${String(y)}" r="2.6" ${stroke(C.ink, 1.9)}/>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "plus-rings": {
    means: "Dwayna's Touch: a plus over three rings: healing for each enchantment on you.",
    draw: () => inkLine("M12 2.5V12M7.5 7.2H16.5", 2.6) + ench(5, 19) + ench(12, 19) + ench(19, 19),
  },
  "bolt-felled": {
    means: "Lightning Surge: a bolt over a figure lying flat: the strike that knocks down.",
    draw: () =>
      inkFill("M14 2L6.5 12.5H11L8.5 17.5L18 8.5H12.5Z") +
      `<circle cx="5" cy="20.5" r="2.2" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M8.5 20.5H21", 2.4),
  },
  "ward-ground": {
    means: "Ward Against Harm: a shield standing in a ground ring: a ward on the floor.",
    draw: () =>
      `<ellipse cx="12" cy="18" rx="10" ry="4" ${stroke(C.ink, 2)}/>` +
      inkLine(
        "M12 2L18 4.5V10C18 13.5 15.5 15.5 12 17C8.5 15.5 6 13.5 6 10V4.5ZM12 6.5V12M9.5 9H14.5",
        2.2,
      ),
  },
  "hourglass-energy": {
    means: "Mantra of Recall: an hourglass with a bolt: Energy comes when the sand runs out.",
    draw: () =>
      inkLine("M3 3H13M3 21H13", 2.2) +
      inkLine(
        "M4.5 3C4.5 9 11.5 10 11.5 12S4.5 15 4.5 21M11.5 3C11.5 9 4.5 10 4.5 12S11.5 15 11.5 21",
        1.9,
      ) +
      at(glyph("energy"), 18, 12, 0.95),
  },
  "signet-star": {
    means: "Signet of Mystic Wrath: a signet ring with a holy star: holy damage per enchantment.",
    draw: () => ringDot(8, 8, 5.5) + holyStar(16.5, 16.5, 6.5) + ench(5, 19.5),
  },
  "hex-spell-drop": {
    means:
      "Mark of Subversion: a hex ring with a struck spark and a drop: the spell fails, Health is stolen.",
    draw: () =>
      HEX_RING + holyStar(10.5, 10.5, 4.5) + inkLine("M6 17L17 6", 2) + at(DROP, 17.5, 18, 0.5),
  },
  "palm-felled": {
    means: "Shove: a palm pushing a figure away: the stance ends and they fall.",
    draw: () => inkFill("M2 5H6V19H2Z") + inkLine("M8 12H12", 2.4) + smallFigure(17.5, 12, 0.8),
  },
};

export default glyphs;
