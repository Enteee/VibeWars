// Glyphs (#2456): the stand-ins of #2447.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** A line in the panel colour, cut out of an ink shape. @param {string} d @param {number} w */
const cut = (d, w) => `<path d="${d}" ${stroke(C.bg, w)}/>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "coal-sparks": {
    means:
      "Smoldering Embers: one faceted coal with three sparks rising: a slow glow that burns what it touches, once a second.",
    draw: () =>
      inkFill("M5 22L3.500 15L8 11L15 10.500L20 14.500L19 22Z") +
      cut("M8 14L12 17L16 14", 1.6) +
      inkLine("M8 6.500V3M12 7V1.500M16 6.500V3", 2.2),
  },
  "coal-bed-flames": {
    means:
      "Bed of Coals: a low bed of four coals with a small flame on each of three: fire spread on the ground, for foes who cannot get up.",
    draw: () =>
      inkFill("M1.500 22V16H6V22ZM7 22V16H11V22ZM12.500 22V16H17V22ZM18 22V16H22.500V22Z") +
      inkFill(
        "M4 14C1.500 11 4.500 9 4 5C7 8 7 11 4 14ZM12 14C9 11 12.500 8 12 3C15.500 7 15 11 12 14ZM20 14C17.500 11 20 9 19.500 6C22 8 22 11 20 14Z",
      ),
  },
  "mask-tears": {
    means:
      "Ancestor's Visage: a mask with eye slits and two drops falling from its chin: the faces of the dead drain the energy of foes.",
    draw: () =>
      inkFill("M4 3H20V11C20 15 16 17 12 17C8 17 4 15 4 11Z") +
      cut("M7 8L10.500 9.500M17 8L13.500 9.500M12 11V13.500", 2) +
      inkFill(
        "M7 19L8.500 21.500A1.500 1.500 0 1 1 5.500 21.500ZM17 19L18.500 21.500A1.500 1.500 0 1 1 15.500 21.500Z",
      ),
  },
  "ring-gem-star": {
    means:
      "Signet of Disenchantment: a signet ring with a gem, and a four-pointed star pulled off to its side: the enchantment is taken.",
    draw: () =>
      `<circle cx="9" cy="14" r="6.500" ${stroke(C.ink, 2.4)}/>` +
      inkFill("M9 2L12.500 5.500L9 9L5.500 5.500Z") +
      inkFill("M19 1.500L20.500 5L24 6.500L20.500 8L19 11.500L17.500 8L14 6.500L17.500 5Z"),
  },
  "hex-ban": {
    means: "Deny Hexes: a hex diamond inside a prohibition ring: hexes refused.",
    draw: () =>
      `<circle cx="12" cy="12" r="9.500" ${stroke(C.ink, 2.4)}/>` +
      inkFill("M12 6L17 12L12 18L7 12Z") +
      cut("M5.500 18.500L18.500 5.500", 2.6),
  },
  "heart-rise": {
    means:
      "Renew Life: a solid heart with an arrow cut rising out of it: the dead stand up again, the living are renewed.",
    draw: () =>
      inkFill(
        "M12 22C3 15 2 9 5.500 5.500C8.500 3 11 5 12 7C13 5 15.500 3 18.500 5.500C22 9 21 15 12 22Z",
      ) + cut("M12 18V9M8.500 12.500L12 9L15.500 12.500", 2.2),
  },
  "blade-flourish": {
    means:
      "Flourish: a sword with a looping swoosh round its hilt: a showy strike that gives adrenaline back.",
    draw: () =>
      inkLine("M6.500 17.500L20 4", 3) +
      inkLine("M5 12.500L11 18.500M7 17L3 21", 2.4) +
      inkLine("M2 11C2 3 11 2 11 6.500C11 10 5.500 9 7 4.500", 2),
  },
};

export default glyphs;
