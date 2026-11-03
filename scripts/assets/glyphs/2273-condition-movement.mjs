// Glyphs (#2273): the condition-movement skills of #2259.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, smallSkull, wasUrn } from "../glyph-kit.mjs";

/** A drop centred on (x, y), `k` times the full-grid drop. @param {number} x @param {number} y @param {number} k */
const drop = (x, y, k) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-12)">` +
  inkFill("M12 2.5C16 8.5 19 12 19 15.5A7 7 0 0 1 5 15.5C5 12 8 8.5 12 2.5Z") +
  "</g>";

/** A filled heart centred on (x, y), `k` times a 24 px one. @param {number} x @param {number} y @param {number} k */
const heart = (x, y, k) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-12)">` +
  inkFill("M12 21L4.5 13.5A4.6 4.6 0 0 1 12 7.5A4.6 4.6 0 0 1 19.5 13.5Z") +
  "</g>";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "drops-fan": {
    means:
      "Fevered Dreams: one drop fanning out to three: each new condition on the hexed foe spreads to the foes round it.",
    draw: () =>
      drop(6, 12, 0.62) +
      inkLine("M11 12L15.5 5M11 12H15.5M11 12L15.5 19", 1.8) +
      drop(19.5, 4.5, 0.3) +
      drop(19.5, 12, 0.3) +
      drop(19.5, 19.5, 0.3),
  },
  "drop-to-skull": {
    means: "Plague Sending: a drop, an arrow, a skull: your conditions thrown at the foe.",
    draw: () =>
      drop(6, 12, 0.62) +
      inkLine("M11 12H14", 2.2) +
      inkFill("M15 8.5L18 12L15 15.5Z") +
      smallSkull(19.5, 12, 0.5),
  },
  "ring-bolt-drops": {
    means:
      "Mark of Fury: a target ring cut by a bolt, with two drops beside it: fury on the mark, conditions to spread.",
    draw: () =>
      `<circle cx="9" cy="12" r="6.5" ${stroke(C.ink, 2)}/>` +
      inkFill("M11 5L6 13H9.5L7.5 19L12.5 11H9Z") +
      drop(19.5, 6.5, 0.36) +
      drop(19.5, 17.5, 0.36),
  },
  "drop-to-heart": {
    means: "Foul Feast: a drop, an arrow, a heart: every condition taken off an ally feeds you.",
    draw: () =>
      drop(5, 12, 0.5) +
      inkLine("M9 12H11.5", 2) +
      inkFill("M11 8.5L14 12L11 15.5Z") +
      heart(18, 12, 0.62),
  },
  "heart-drops": {
    means:
      '"I Will Survive!": a heart under a row of drops: Health regeneration for every condition on you.',
    draw: () => heart(12, 15, 0.8) + drop(5.5, 5, 0.3) + drop(12, 5, 0.3) + drop(18.5, 5, 0.3),
  },
  "urn-drop": {
    means:
      "Resilient Was Xiko: the held ashes' urn with a drop in it: regeneration while conditions last.",
    draw: () => wasUrn(drop(12, 15, 0.5)),
  },
};

export default glyphs;
