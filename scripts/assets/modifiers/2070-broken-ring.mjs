// Modifiers (#2070): the enchantment's ring, whole for its cost and broken for its removal.

import { C, stroke } from "../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  ring: {
    means: "A small ring: the skill is about enchantments (#2070).",
    draw: () => `<circle cx="19" cy="18" r="3.2" ${stroke(C.ink, 1.6)}/>`,
  },
  unring: {
    means: "A small ring broken open: the skill strips an enchantment (#2070).",
    draw: () => `<path d="M21.6 15.4A3.4 3.4 0 1 0 22.4 18.4" ${stroke(C.ink, 1.6)}/>`,
  },
};

export default glyphs;
