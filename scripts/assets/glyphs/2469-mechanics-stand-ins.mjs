// Glyphs (#2469): the stand-ins of #2446.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** A line in the panel colour, cut out of an ink shape. @param {string} d @param {number} w */
const cut = (d, w) => `<path d="${d}" ${stroke(C.bg, w)}/>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "dagger-arc": {
    means:
      "Augury of Death: a dashed leap that ends in a dagger point: you step through the shadows to the foe.",
    draw: () =>
      inkLine("M2.500 20C3 10 9 4 16 3.500", 2.2).replace("/>", ' stroke-dasharray="3 2.600"/>') +
      inkFill("M17 2H22L20 6L19.500 9H18.500L18 6Z") +
      inkLine("M16 11H22", 2) +
      inkFill("M19 11H21V16H19Z"),
  },
  "funnel-bolt": {
    means:
      "Storm Djinn's Haste: a whirlwind funnel with a bolt through it: spells cast faster in the storm's speed.",
    draw: () =>
      inkLine("M3 4H21M5 9H19M8 14H16M10.500 19H13.500", 2.4) + cut("M14 2L9.500 12H14L10 22", 1.8),
  },
  "seal-chevrons": {
    means:
      "Symbolic Celerity: a signet's square seal with two chevrons cut in it: signets cast as fast as a trained caster.",
    draw: () =>
      inkFill("M5 3H19Q21 3 21 5V19Q21 21 19 21H5Q3 21 3 19V5Q3 3 5 3Z") +
      cut("M7 7L12 12L7 17M13 7L18 12L13 17", 2),
  },
  "plus-chevrons": {
    means: "Healer's Boon: a plus split by two chevrons: healing spells cast faster and heal more.",
    draw: () =>
      inkFill("M9 2H15V9H22V15H15V22H9V15H2V9H9Z") + cut("M7 8L11 12L7 16M13 8L17 12L13 16", 1.8),
  },
  "sunrise-plus": {
    means:
      "Light of Dwayna: a sun rising over the horizon with a plus in its disc: the whole party is raised and healed.",
    draw: () =>
      inkFill("M3 17A9 9 0 0 1 21 17Z") +
      cut("M12 10V15M9.500 12.500H14.500", 1.8) +
      inkLine("M12 2V4M3.500 6.500L5 8M20.500 6.500L19 8M1.500 21H22.500", 2),
  },
};

export default glyphs;
