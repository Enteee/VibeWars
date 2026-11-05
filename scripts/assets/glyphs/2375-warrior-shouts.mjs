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
  "blade-speed": {
    means: "Burst of Aggression: a sword with speed marks behind it: faster attacks.",
    draw: () =>
      inkLine("M21 3L10 14", 3.4) +
      inkLine("M6.500 11.500L12.500 17.500", 2.4) +
      inkLine("M9 15L4 20", 3) +
      inkLine("M2 3H10M2 7H6.500M2 11H4", 2),
  },
  "eye-blind": {
    means:
      "Smoke Powder Defense: an eye struck through with a slash: foes blinded when you are hit.",
    draw: () =>
      inkFill("M2 12C6 5 18 5 22 12C18 19 6 19 2 12Z") +
      `<path d="M12 9.500A2.500 2.500 0 1 1 12 14.500A2.500 2.500 0 1 1 12 9.500Z" fill="${C.bg}"/>` +
      `<path d="M4 21L20 3" ${stroke(C.bg, 5)}/>` +
      inkLine("M4 21L20 3", 2.4),
  },
};

export default glyphs;
