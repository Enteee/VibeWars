// Glyphs (#2069): the bare trap, and the palm that cannot be touched.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "trap-jaws": {
    means: "A snap trap: two toothed jaws open on a ground line. A trap skill's own mark (#2069).",
    draw: () =>
      inkLine("M3 20H21", 2.5) +
      inkFill("M4 19L5.5 9L8 14L10.5 7L12 19Z") +
      inkFill("M20 19L18.5 9L16 14L13.5 7L12 19Z"),
  },
  "palm-ward": {
    means: "A raised palm behind a bar: touch turned away (#2069).",
    draw: () =>
      `<path d="M7 21V10a1.5 1.5 0 0 1 3 0V5a1.5 1.5 0 0 1 3 0v5V6a1.5 1.5 0 0 1 3 0v4V9a1.5 1.5 0 0 1 3 0v7c0 3-2 5-5 5z" ${stroke(C.ink, 1.9)}/>` +
      inkLine("M3 3L21 21", 2.6),
  },
};

export default glyphs;
