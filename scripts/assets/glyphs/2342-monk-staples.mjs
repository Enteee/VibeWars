// Glyphs (#2342): the stand-ins of #2286.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "bolt-bond-cross": {
    means: "Essence Bond: a bolt and a cross joined by a bar: the Health healed returns as Energy.",
    draw: () =>
      inkFill("M8 2L3 12H7L5 22L12 10H8Z") +
      inkFill("M15.500 6H18.500V10H22V13H18.500V17H15.500V13H12V10H15.500Z") +
      inkLine("M10 18H19", 2),
  },
  "shield-heart": {
    means: "Life Barrier: a shield outline holding a solid heart: damage turned to Health.",
    draw: () =>
      inkLine("M12 2L4 5V12C4 17 8 20 12 22C16 20 20 17 20 12V5Z", 2) +
      inkFill("M12 18L7.500 13.500A2.800 2.800 0 0 1 12 10A2.800 2.800 0 0 1 16.500 13.500Z"),
  },
  "shield-return": {
    means: "Retribution: a solid shield with a turn-back arrow cut into it: blows sent back.",
    draw: () =>
      inkFill("M12 2L3 5V12C3 17 8 20 12 22C16 20 21 17 21 12V5Z") +
      `<path d="M17 9H9M12 6L9 9L12 12" ${stroke(C.bg, 2)}/>` +
      `<path d="M8 15H15" ${stroke(C.bg, 2)}/>`,
  },
  "cross-cracked": {
    means: "Scourge Healing: a solid cross split by a jagged crack: healing turned to harm.",
    draw: () =>
      inkFill("M9 2H15V9H22V15H15V22H9V15H2V9H9Z") +
      `<path d="M3 20L10 13L13 16L21 6" ${stroke(C.bg, 1.8)}/>`,
  },
  "seed-sprout": {
    means: "Healing Seed: a solid seed with a stem and two leaves: Health that grows.",
    draw: () =>
      inkFill("M12 15A5 4 0 1 1 12 23A5 4 0 1 1 12 15Z") +
      inkLine("M12 15V8", 2.2) +
      inkFill("M12 10C8 10 5 8 5 4C9 4 12 6 12 10ZM12 8C16 8 19 6 19 2C15 2 12 4 12 8Z"),
  },
  "cross-catch": {
    means: "Succor: a solid cross caught in a cupped arc: help that arrives as you fall.",
    draw: () =>
      inkFill("M9.500 2H14.500V7H19.500V12H14.500V17H9.500V12H4.500V7H9.500Z") +
      inkLine("M2 15C2 22 22 22 22 15", 2.4),
  },
  "star-heart": {
    means: "Divine Boon: a solid star over a solid heart: favour poured into a heal.",
    draw: () =>
      inkFill(
        "M12 1L14 6.500L19.500 6.800L15.200 10.300L16.700 15.500L12 12.500L7.300 15.500L8.800 10.300L4.500 6.800L10 6.500Z",
      ) + inkFill("M12 23L6 17A3 3 0 0 1 12 14A3 3 0 0 1 18 17Z"),
  },
  "wind-curls": {
    means: "Restful Breeze: three lines of wind curling at the ends: a calm that heals.",
    draw: () =>
      inkLine("M2 7H15A3.500 3.500 0 1 0 11.500 3.500", 2.4) +
      inkLine("M2 13H19A3.500 3.500 0 1 1 15.500 16.500", 2.4) +
      inkLine("M2 19H9", 2.4),
  },
};

export default glyphs;
