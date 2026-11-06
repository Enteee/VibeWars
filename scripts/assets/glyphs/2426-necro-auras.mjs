// Glyphs (#2426): the stand-ins of #2411.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "blade-down-aura": {
    means:
      "Withering Aura: a blade point down between two aura arcs: the ally's melee hits weaken.",
    draw: () =>
      inkLine("M4.500 5Q1 12 4.500 19M19.500 5Q23 12 19.500 19", 2.2) +
      inkLine("M12 3V8M8.500 8H15.500", 2.4) +
      inkFill("M10 9.500H14L12 21.500Z"),
  },
  "hex-ring-regen": {
    means:
      "Hexer's Vigor: a dashed ring (a hex) holding a plus over rising regeneration bars: health regenerates while hexes are cast.",
    draw: () =>
      `<circle cx="12" cy="12" r="9.500" ${stroke(C.ink, 2)} stroke-dasharray="4.500 3.300"/>` +
      inkLine("M12 6V12M9 9H15", 2.2) +
      inkLine("M8 18.500V16M12 18.500V14.500M16 18.500V13", 2),
  },
};

export default glyphs;
