// Glyphs (#2465): the stand-ins of #2453.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** A line in the panel colour, cut out of an ink shape. @param {string} d @param {number} w */
const cut = (d, w) => `<path d="${d}" ${stroke(C.bg, w)}/>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "bust-facets": {
    means:
      "Stoneflesh Aura: a head and shoulders of faceted stone: the body itself is rock, blows land softer and never crit.",
    draw: () =>
      inkFill("M12 2L16 4.500L16 9.500L12 12L8 9.500L8 4.500Z") +
      inkFill("M2 22V17L7 13.500H17L22 17V22Z") +
      cut("M12 2V12M8 4.500L12 7L16 4.500", 1.2) +
      cut("M7 13.500L12 18L17 13.500", 1.4),
  },
  "diamond-shackles": {
    means:
      "Icy Shackles: an ice crystal held between two linked cuffs: the hexed foe crawls, and barely moves at all while enchanted.",
    draw: () =>
      inkFill("M12 2L17 12L12 22L7 12Z") +
      cut("M12 6V18", 1.2) +
      inkLine(
        "M5.500 12A2.500 2.500 0 1 1 2 12A2.500 2.500 0 1 1 5.500 12M22 12A2.500 2.500 0 1 1 18.500 12A2.500 2.500 0 1 1 22 12",
        2,
      ),
  },
  "rune-streak": {
    means:
      "Glyph of Swiftness: a rune diamond trailing three speed streaks: the next spells recharge sooner and their projectiles fly faster.",
    draw: () =>
      inkFill("M15 3L22 12L15 21L8 12Z") +
      cut("M15 8V16M11.500 12H18.500", 1.6) +
      inkLine("M1.500 7H8M1.500 12H6M1.500 17H8", 2.2),
  },
  "ring-dumbbell": {
    means:
      "Ward of Weakness: a sagging dumbbell above a ground ring: foes standing in the ward grow weak when elemental damage hits.",
    draw: () =>
      `<ellipse cx="12" cy="19" rx="9.500" ry="3.500" ${stroke(C.ink, 2)}/>` +
      inkLine("M7 8Q12 14 17 8", 2.4) +
      inkFill("M3 3H7V11H3Z") +
      inkFill("M17 3H21V11H17Z"),
  },
  "flame-drop": {
    means:
      "Extinguish: a flame with a water drop cut into its heart: one condition put out, and Burning heals the party.",
    draw: () =>
      inkFill(
        "M12 2C13 6 19 9 19 15A7 7 0 0 1 5 15C5 12 7 10.500 8 8C9.500 9.500 10 10 11 9C11 6 11 4 12 2Z",
      ) + cut("M12 11.500C13.500 14 15 15 15 17A3 3 0 0 1 9 17C9 15 10.500 14 12 11.500Z", 1.4),
  },
  "mace-halos": {
    means:
      "Smiter's Boon: a mace under two stacked halos: the Divine Favor bonus of smiting spells is doubled.",
    draw: () =>
      inkLine("M12 12V22", 2.4) +
      inkFill("M8 12L9 9H15L16 12Z") +
      inkLine("M7 12H17", 2) +
      `<ellipse cx="12" cy="2.800" rx="4" ry="1.300" ${stroke(C.ink, 1.4)}/>` +
      `<ellipse cx="12" cy="6" rx="5" ry="1.600" ${stroke(C.ink, 1.4)}/>`,
  },
};

export default glyphs;
