// Glyphs (#2193): the Mesmer interrupts of #2165, each the interrupt burst plus what follows it.

import { C, stroke } from "../icon-kit.mjs";
import { glyph, inkFill, inkLine } from "../glyph-kit.mjs";

/**
 * The interrupt burst, scaled and centred on a point.
 * @param {number} cx
 * @param {number} cy
 * @param {number} k
 */
const burstAt = (cx, cy, k) =>
  `<g transform="translate(${String(cx)},${String(cy)}) scale(${String(k)}) translate(-12,-12)">${glyph("interrupt")}</g>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "interrupt-lock": {
    means:
      "A broken spell with a padlock beside it: interrupted, and locked for a long time (Power Lock).",
    draw: () =>
      burstAt(9, 9, 0.8) +
      `<path d="M14.5 15.5V13a3.5 3.5 0 0 1 7 0v2.5" ${stroke(C.ink, 1.8)}/>` +
      inkFill("M13 15.5H23V22H13Z"),
  },
  "interrupt-signet": {
    means:
      "A signet ring round a broken spell: the interrupt grows with each signet you carry (Signet of Distraction).",
    draw: () => `<circle cx="12" cy="12" r="10" ${stroke(C.ink, 2)}/>` + burstAt(12, 12, 0.85),
  },
  "interrupt-cluster": {
    means:
      "Three broken spells together: every foe near the target is interrupted and locked (Complicate).",
    draw: () => burstAt(12, 6.5, 0.6) + burstAt(6.5, 17, 0.6) + burstAt(17.5, 17, 0.6),
  },
  "interrupt-twice": {
    means:
      "Two broken spells joined by a thread: it interrupts when cast and again when the hex ends (Web of Disruption).",
    draw: () =>
      inkLine("M9 9L15 15", 1.6) +
      burstAt(7, 7, 0.7) +
      burstAt(17, 17, 0.7) +
      inkLine("M14 3Q21 3 21 10M3 14Q3 21 10 21", 1.6),
  },
};

export default glyphs;
