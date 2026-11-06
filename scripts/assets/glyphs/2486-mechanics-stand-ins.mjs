// Glyphs (#2486): the stand-ins of #2459, #2470, #2471 and #2472.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** A line in the panel colour, cut out of an ink shape. @param {string} d @param {number} w */
const cut = (d, w) => `<path d="${d}" ${stroke(C.bg, w)}/>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "twin-crescents": {
    means: "Twin Moon Sweep: two crescent cuts, one over the other: the scythe strikes twice.",
    draw: () =>
      inkFill("M2 9A10 8 0 0 1 22 9A10 4.500 0 0 0 2 9Z") +
      inkFill("M2 19A10 8 0 0 1 22 19A10 4.500 0 0 0 2 19Z"),
  },
  "heat-shimmer": {
    means:
      "Savannah Heat: a low sun over wavy heat lines on the ground: a patch that burns harder the longer you stand in it.",
    draw: () =>
      inkFill("M6.500 11.500A5.500 5.500 0 0 1 17.500 11.500Z") +
      inkLine("M12 2V3.500M4 5.500L5.500 7M20 5.500L18.500 7", 1.8) +
      inkLine("M1.500 15Q4.500 12.500 7.500 15T13.500 15T19.500 15", 2) +
      inkLine("M4.500 20Q7.500 17.500 10.500 20T16.500 20T22.500 20", 2),
  },
  "hourglass-take": {
    means: "Stolen Speed: an hourglass with an arrow leaving it: its speed is taken.",
    draw: () =>
      inkFill("M2 3H14V5C14 9 10 11 10 12C10 13 14 15 14 19V21H2V19C2 15 6 13 6 12C6 11 2 9 2 5Z") +
      inkLine("M15.500 12H22M19 8.500L22.500 12L19 15.500", 2.2),
  },
  "loaded-die": {
    means: "Calculated Risk: a die: a gamble that may come back at the one who rolls it.",
    draw: () =>
      inkFill("M5 2H15Q17 2 17 4V14Q17 16 15 16H5Q3 16 3 14V4Q3 2 5 2Z") +
      cut("M6.500 5.500H6.600M10 9H10.100M13.500 12.500H13.600", 2.6),
  },
  "blade-dashed": {
    means:
      "Illusionary Weaponry: a sword drawn in dashes over a solid hilt: a blade that is not there.",
    draw: () =>
      inkLine("M7 17L19 5L21 3L19.500 7.500L9 18Z", 1.8).replace(
        "/>",
        ' stroke-dasharray="2.200 1.800"/>',
      ) +
      inkLine("M4 14L10 20M3 21L7 17", 2.4) +
      inkLine("M16 3.500V6.500M18.500 1.500V3.500", 1.6),
  },
  "vessel-burst": {
    means: "Aneurysm: a vessel swelling until it bursts: the foe's energy is struck out of them.",
    draw: () =>
      inkLine("M1.500 14H5", 2.4) +
      inkFill("M10 8A5.500 5.500 0 1 1 10 19A5.500 5.500 0 1 1 10 8Z") +
      cut("M7 12.500L10 14L8.500 17L12 17.500", 1.6) +
      inkLine("M14.500 8L18.500 4M16.500 11.500H22M15 5L16 2", 2),
  },
  "seal-rage": {
    means:
      "Signet of Rage: a signet's square seal with a jagged flame cut in it: adrenaline turned to holy damage.",
    draw: () =>
      inkFill("M5 3H19Q21 3 21 5V19Q21 21 19 21H5Q3 21 3 19V5Q3 3 5 3Z") +
      cut("M7.500 18L8.500 10L11 13L12 6L14 12L16.500 9L16.500 18Z", 1.8),
  },
  "grave-aura": {
    means:
      "Unyielding Aura: an arched grave with arcs of light beside it: a resurrection held in place, and gone when it ends.",
    draw: () =>
      inkFill("M5 21V10A5 5 0 0 1 15 10V21Z") +
      cut("M10 8V15M7.500 11H12.500", 1.8) +
      inkLine("M2.500 7Q1 13 2.500 19M17.500 5Q22 10 17.500 15", 2) +
      inkLine("M2 21.500H16", 2.2),
  },
};

export default glyphs;
