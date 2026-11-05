// Glyphs (#2292): the stand-ins of #2260 and #2282.

import { stroke, C } from "../icon-kit.mjs";
import {
  DROP,
  bladeMark,
  glyph,
  holyStar,
  inkFill,
  inkLine,
  ringDot,
  smallFigure,
} from "../glyph-kit.mjs";

/** @param {string} g @param {number} x @param {number} y @param {number} k */
const at = (g, x, y, k) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-12)">${g}</g>`;

/** A filled heart centred on (x, y), `k` times a 24 px one. @param {number} x @param {number} y @param {number} k */
const heart = (x, y, k) =>
  at(inkFill("M12 21L4.5 13.5A4.6 4.6 0 0 1 12 7.5A4.6 4.6 0 0 1 19.5 13.5Z"), x, y, k);

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "signet-drop-struck": {
    means: "Purge Signet: a signet ring and a drop struck through: it removes a condition.",
    draw: () => ringDot(9, 9, 6) + at(DROP, 17, 16.5, 0.62) + inkLine("M12.5 22L22 11", 2.2),
  },
  "signet-rings-energy": {
    means:
      "Blessed Signet: a signet ring over three small rings, with a bolt: energy for every maintained enchantment.",
    draw: () =>
      ringDot(8, 8, 5.5) +
      [5, 11.5, 18]
        .map((x) => `<circle cx="${String(x)}" cy="19" r="2.4" ${stroke(C.ink, 1.8)}/>`)
        .join("") +
      at(glyph("energy"), 18, 7, 0.62),
  },
  "signet-flame": {
    means: "Cautery Signet: a signet ring and a flame: the signet burns you to cleanse.",
    draw: () => ringDot(8, 8, 5.5) + at(glyph("flame"), 15.5, 15.5, 1) + inkLine("M2 21H8", 2.2),
  },
  "stars-adjacent": {
    means:
      "Glimmering Mark: a big star with a small one each side of it: damage on the foe and those next to it.",
    draw: () => holyStar(12, 12, 7) + holyStar(3.5, 19.5, 3.5) + holyStar(20.5, 4.5, 3.5),
  },
  "figure-flame-strike": {
    means:
      "Zealot's Fire: an ally figure with a flame beside it: aiding an ally burns the foes round it.",
    draw: () =>
      smallFigure(7, 14, 0.8) + at(glyph("flame"), 17, 9, 0.85) + inkLine("M13 21H22", 2.2),
  },
  "hearts-less": {
    means:
      "Spoil Victor: a small heart over a big one with an arrow falling from it: the weaker one loses Health.",
    draw: () =>
      heart(7, 7, 0.55) + heart(16, 14, 1) + inkLine("M7 12V21M4.5 18.5L7 21L9.5 18.5", 1.9),
  },
  "blade-no-bars": {
    means:
      "Wild Blow: a blade over empty bar stubs: an unblockable blow that spends all adrenaline.",
    draw: () => bladeMark(inkFill("M2 18.5H7V22H2Z M9 18.5H14V22H9Z M16 18.5H21V22H16Z")),
  },
};

export default glyphs;
