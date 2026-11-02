// Modifiers (#2069): a sight for a trap made sharper, a linked pair for pet and owner.

import { C, stroke } from "../icon-kit.mjs";
import { inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  focus: {
    means: "A sight: a ring with four ticks, the skill made sharper (#2069).",
    draw: () =>
      `<circle cx="19" cy="18" r="2.2" ${stroke(C.ink, 1.5)}/>` +
      inkLine("M19 14.2V15.6M19 20.4V21.8M15.2 18H16.6M21.4 18H22.8", 1.4),
  },
  pair: {
    means: "Two dots on a bar: you and your pet strike together (#2069).",
    draw: () =>
      `<circle cx="16.4" cy="18" r="1.5" fill="${C.ink}"/><circle cx="21.6" cy="18" r="1.5" fill="${C.ink}"/>` +
      inkLine("M16.4 18H21.6", 1.3),
  },
};

export default glyphs;
