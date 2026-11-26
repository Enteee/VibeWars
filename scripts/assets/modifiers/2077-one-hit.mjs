// Modifiers (#2077): one hit.

import { C } from "../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  dot: {
    means: "A single dot: it lasts one hit (#2077).",
    draw: () => `<circle cx="19" cy="18" r="2" fill="${C.ink}"/>`,
  },
};

export default glyphs;
