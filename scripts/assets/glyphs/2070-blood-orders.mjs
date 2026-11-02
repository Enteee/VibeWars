// Glyphs (#2070): the Blood orders, one drop of blood among the party.

import { C } from "../icon-kit.mjs";
import { inkFill } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "order-drop": {
    means: "A drop of blood ringed by three dots: an order the whole party follows (#2070).",
    draw: () =>
      inkFill("M12 6c3.2 4 5.2 6.6 5.2 9.2a5.2 5.2 0 0 1-10.4 0C6.8 12.6 8.8 10 12 6z") +
      [
        [4.5, 5],
        [19.5, 5],
        [12, 2.5],
      ]
        .map(([x, y]) => `<circle cx="${String(x)}" cy="${String(y)}" r="1.9" fill="${C.ink}"/>`)
        .join(""),
  },
};

export default glyphs;
