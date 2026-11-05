// Glyphs (#2293): the stand-ins of #2275.

import { C, stroke } from "../icon-kit.mjs";
import { DROP, glyph, holyStar, inkFill, inkLine } from "../glyph-kit.mjs";

/** @param {string} g @param {number} x @param {number} y @param {number} k */
const at = (g, x, y, k) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-12)">${g}</g>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "dagger-star": {
    means: "Way of the Assassin: a dagger with a star at its tip: daggers strike critical.",
    draw: () =>
      inkLine("M3 21L12 12", 2.6) + inkFill("M9 9L14 11L12.5 15.5L8.5 14Z") + holyStar(17, 7, 6),
  },
  "arch-keystone": {
    means: "Keystone Signet: an arch with its keystone lit and a ring below: the signet's echo.",
    draw: () =>
      inkLine("M3 22V12A9 9 0 0 1 21 12V22", 2.2) +
      inkFill("M9.5 2.5H14.5L13.5 9H10.5Z") +
      `<circle cx="12" cy="16" r="2.6" ${stroke(C.ink, 2)}/>`,
  },
  "heart-energy": {
    means: "Masochism: a hollow heart with a bolt beside it: pain is energy.",
    draw: () =>
      inkLine("M9 21L3 15A3.7 3.7 0 0 1 9 9A3.7 3.7 0 0 1 15 15Z", 2.2) +
      at(glyph("energy"), 17, 8, 0.8),
  },
  "pulse-arcs": {
    means: "Agony: a jagged life line under two arcs: pain pulsing out each second.",
    draw: () =>
      inkLine("M2 15H6.5L9 8L12.5 20L15.5 11L17 15H22", 2.2) +
      inkLine("M6 4.5A9 9 0 0 1 18 4.5", 2) +
      inkLine("M9 1.8A5 5 0 0 1 15 1.8", 1.8),
  },
  "scythe-drop": {
    means: "Grenth's Aura: a scythe over a drop: scythe blows steal Health.",
    draw: () =>
      inkLine("M18 22L9.5 4", 2.4) +
      inkFill("M9.5 4C14.5 2 20 5 22 10C17.5 7.5 13.5 6.5 9.5 4Z") +
      at(DROP, 6, 17, 0.7),
  },
};

export default glyphs;
