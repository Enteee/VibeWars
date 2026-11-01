// Modifiers (#1987): the small shield, for a skill that pays when it blocks.

import { inkFill } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  block: {
    means: "A small shield: the skill pays when it blocks (#1987).",
    draw: () =>
      inkFill(
        "M19 14.2L22.4 15.5V18.2C22.4 20 20.9 21.3 19 22.2C17.1 21.3 15.6 20 15.6 18.2V15.5Z",
      ),
  },
};

export default glyphs;
