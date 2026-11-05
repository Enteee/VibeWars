// Glyphs (#2343): the stand-ins of #2268.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "corpse-leap": {
    means:
      "Consume Corpse: a lying body with an arc arrow landing on it: a leap to a corpse that eats it.",
    draw: () =>
      inkFill("M2 20A2.500 2.500 0 1 1 7 20A2.500 2.500 0 1 1 2 20Z") +
      inkFill("M9 18H22V22H9Z") +
      inkLine("M3 12C3 5 10 3 16 9", 2.2) +
      inkFill("M17.500 14L12.500 8.500L20 8Z"),
  },
  "skull-streak": {
    means:
      "Necrotic Traversal: a solid skull with speed streaks behind it: a rush through the dead.",
    draw: () =>
      inkFill(
        "M15 3C10.500 3 8 6 8 9.500C8 12 9 13 10.500 14V18H19.500V14C21 13 22 12 22 9.500C22 6 19.500 3 15 3Z",
      ) +
      `<path d="M12.500 9.500H14.500M16.500 9.500H18.500" ${stroke(C.bg, 2.4)}/>` +
      inkLine("M2 7H6M1 12H5M2 17H6", 2),
  },
};

export default glyphs;
