// Glyphs (#2334): the stand-ins of #2287.

import { C, stroke } from "../icon-kit.mjs";
import { DROP, HEX_RING, glyph, inkFill, inkLine } from "../glyph-kit.mjs";

/** @param {string} g @param {number} x @param {number} y @param {number} k */
const at = (g, x, y, k) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-12)">${g}</g>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "drop-crown": {
    means: "Ether Lord: a crowned drop: you rule Energy, drawing it from the foe.",
    draw: () => inkFill("M6 8L7 2.5L10 5L12 2L14 5L17 2.5L18 8Z") + at(DROP, 12, 16, 0.62),
  },
  "hex-ring-cross": {
    means: "Spirit of Failure: a hex ring round a cross: the attack that fails.",
    draw: () => HEX_RING + inkLine("M8.5 8.5L15.5 15.5M15.5 8.5L8.5 15.5", 2.4),
  },
  "shackle-pair": {
    means: "Spirit Shackles: two heavy rings joined by a link: the foe is held.",
    draw: () =>
      `<circle cx="6.500" cy="12" r="4.200" ${stroke(C.ink, 2.4)}/>` +
      `<circle cx="17.500" cy="12" r="4.200" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M10.700 12H13.300", 2.4) +
      inkLine("M4 20H9M15 20H20", 2),
  },
  "moon-bars": {
    means: "Soothing Images: a crescent moon over three short bars: adrenaline lulled to sleep.",
    draw: () =>
      inkFill("M15 2.500A8 8 0 1 0 20.500 14A6.500 6.500 0 0 1 15 2.500Z") +
      inkFill("M3 19H8V22H3ZM9.500 19H14.500V22H9.500ZM16 19H21V22H16Z"),
  },
  "storm-spiral": {
    means: "Chaos Storm: a widening spiral: Energy whirls out in the area.",
    draw: () =>
      inkLine(
        "M12 12a1.5 1.5 0 0 1 3 0a3 3 0 0 1-6 0a4.5 4.5 0 0 1 9 0a6 6 0 0 1-12 0a7.5 7.5 0 0 1 15 0",
        2.2,
      ),
  },
  "head-scatter": {
    means: "Psychic Distraction: a head with scattered dots above it: the thought is lost.",
    draw: () =>
      `<circle cx="12" cy="16" r="5.500" ${stroke(C.ink, 2.2)}/>` +
      inkFill(
        "M5 7.500a1.600 1.600 0 1 0 3.200 0a1.600 1.600 0 1 0-3.200 0ZM10.400 4a1.600 1.600 0 1 0 3.200 0a1.600 1.600 0 1 0-3.200 0ZM15.800 7.500a1.600 1.600 0 1 0 3.200 0a1.600 1.600 0 1 0-3.200 0Z",
      ),
  },
  "bolt-rings": {
    means: "Arcane Languor: a bolt in two rings: the spell costs more than it holds.",
    draw: () =>
      `<circle cx="12" cy="12" r="10" ${stroke(C.ink, 1.6)}/>` +
      `<circle cx="12" cy="12" r="6" ${stroke(C.ink, 2)}/>` +
      at(glyph("energy"), 12, 12, 0.4),
  },
  "zigzag-plus": {
    means: "Illusion of Pain: a jagged pain line over a plus: the pain ends in a heal.",
    draw: () =>
      inkLine("M2 9L6 3.500L10 10L14 2.500L18 9.500L22 5", 2.2) + inkLine("M12 14V22M8 18H16", 3),
  },
  "bolt-uturn": {
    means: "Feedback: an arrow turning back round a bolt: the Energy comes back to hurt.",
    draw: () =>
      at(glyph("energy"), 8, 12, 0.6) +
      inkLine("M12 4H16A8 8 0 0 1 16 20H12", 2.2) +
      inkFill("M13 16.500L9 20L13 23.500Z"),
  },
  "drop-ghost": {
    means: "Ether Phantom: a dashed drop with a spark: Energy that is not really there.",
    draw: () =>
      `<path d="M12 2.500C16 8.500 19 12 19 15.500A7 7 0 0 1 5 15.500C5 12 8 8.500 12 2.500Z" ${stroke(C.ink, 2.2)} stroke-dasharray="3 2.600"/>` +
      inkFill("M12 11L13.200 14L16 15L13.200 16L12 19L10.800 16L8 15L10.800 14Z"),
  },
};

export default glyphs;
