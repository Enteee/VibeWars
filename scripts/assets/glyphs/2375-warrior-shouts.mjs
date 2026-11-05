// Glyphs (#2375): the stand-ins of #2320 and #2362.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "tomb-plus": {
    means:
      "I Will Avenge You!: a solid headstone with a plus cut in it: the fallen make you stronger.",
    draw: () =>
      inkFill("M4 22V10A8 8 0 0 1 20 10V22Z") + `<path d="M12 7V15M8 11H16" ${stroke(C.bg, 2.6)}/>`,
  },
  "face-scream": {
    means: "Fear Me!: a solid face with wide eyes and a gaping mouth: a scream that scares.",
    draw: () =>
      inkFill("M12 2A10 10 0 1 1 12 22A10 10 0 1 1 12 2Z") +
      `<path d="M7.500 8.500A2 2 0 1 1 7.500 12.500A2 2 0 1 1 7.500 8.500ZM16.500 8.500A2 2 0 1 1 16.500 12.500A2 2 0 1 1 16.500 8.500ZM12 14.500A3 3.500 0 1 1 12 21.500A3 3.500 0 1 1 12 14.500Z" fill="${C.bg}"/>`,
  },
  "stakes-bar": {
    means:
      "None Shall Pass!: three pointed stakes behind a solid crossbar: a barrier foes cannot cross.",
    draw: () =>
      inkFill("M3 12H21V16H3Z") +
      inkFill("M5 2L7.500 7H2.500ZM12 2L14.500 7H9.500ZM19 2L21.500 7H16.500Z") +
      inkLine("M5 7V22M12 7V22M19 7V22", 2.4),
  },
  "kneeling-figure": {
    means: "On Your Knees!: a kneeling figure on the ground: foes brought down.",
    draw: () =>
      inkFill("M9 2A3 3 0 1 1 9 8A3 3 0 1 1 9 2Z") +
      inkLine("M9 9V19H3", 3) +
      inkLine("M9 14H17V21", 3) +
      inkLine("M2 22H22", 2),
  },
  "chevrons-blade": {
    means:
      "Burst of Aggression: three heavy chevrons rushing right: speed bought with a lowered guard.",
    draw: () => inkLine("M2 4L9 12L2 20M9.500 4L16.500 12L9.500 20M17 4L24 12L17 20", 3),
  },
  "puff-ground": {
    means: "Smoke Powder Defense: a solid cloud over a ground line: a stance wreathed in smoke.",
    draw: () =>
      inkFill("M6 17A4.500 4.500 0 0 1 6 8A5.500 5.500 0 0 1 17 7A5 5 0 0 1 18 17Z") +
      inkLine("M3 21H21", 2.4),
  },
};

export default glyphs;
