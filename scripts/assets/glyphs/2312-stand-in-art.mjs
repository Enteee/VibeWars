// Glyphs (#2312): the stand-ins of #2290 and #2291.

import { C, stroke } from "../icon-kit.mjs";
import { HEX_RING, glyph, inkFill, inkLine } from "../glyph-kit.mjs";

/** @param {string} g @param {number} x @param {number} y @param {number} k */
const at = (g, x, y, k) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-12)">${g}</g>`;

/** A filled heart centred on (x, y), `k` times a 24 px one. @param {number} x @param {number} y @param {number} k */
const heart = (x, y, k) =>
  at(inkFill("M12 21L4.5 13.5A4.6 4.6 0 0 1 12 7.5A4.6 4.6 0 0 1 19.5 13.5Z"), x, y, k);

const HEART_D = "M12 21L4.5 13.5A4.6 4.6 0 0 1 12 7.5A4.6 4.6 0 0 1 19.5 13.5Z";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "rocks-churning": {
    means: "Churning Earth: a broken ground line with rocks thrown up over it: the earth churns.",
    draw: () =>
      inkLine("M2 21L6 18L10 21L14 18L18 21L22 18", 2.2) +
      inkFill("M5 12L8 9L11 12L8 15Z") +
      inkFill("M13 7L17 3L21 7L17 11Z") +
      inkFill("M11 16L12.5 14.5L14 16L12.5 17.5Z"),
  },
  "hex-energy-down": {
    means: "Mind Wrack: a hex ring round a bolt and a falling arrow: Energy lost to your skills.",
    draw: () =>
      HEX_RING +
      at(glyph("energy"), 12, 10, 0.7) +
      inkLine("M12 16.5V20M9.5 18L12 20.5L14.5 18", 1.8),
  },
  "hex-signet-struck": {
    means: "Ignorance: a hex ring round a signet struck through: no signets.",
    draw: () =>
      HEX_RING +
      `<circle cx="12" cy="12" r="3.8" ${stroke(C.ink, 2)}/><circle cx="12" cy="12" r="1.2" fill="${C.ink}"/>` +
      inkLine("M5 19L19 5", 2.4),
  },
  "tiles-steal": {
    means:
      "Simple Thievery: a cracked skill tile and a solid copy: the interrupted skill is taken.",
    draw: () =>
      `<path d="M11 2H21V12H11Z" ${stroke(C.ink, 2)}/>` +
      inkLine("M17 2L14 7H18L15 12", 1.6) +
      inkFill("M2 13H11V22H2Z") +
      inkLine("M7 10L5 10M5 10L6.5 8.5M5 10L6.5 11.5", 1.6),
  },
  "hex-ring-clock": {
    means:
      "Enchanter's Conundrum: a hex ring round a ring with clock hands: enchantments cast slowly.",
    draw: () =>
      HEX_RING +
      `<circle cx="12" cy="12" r="4.8" ${stroke(C.ink, 2)}/>` +
      inkLine("M12 9V12L14.5 13.5", 1.8),
  },
  "hearts-redirect": {
    means:
      "Life Bond: a heart beside a smaller one with an arrow between them: the blow passes on.",
    draw: () =>
      heart(16, 16.5, 0.8) + heart(5, 5.5, 0.45) + inkLine("M21 5H11M13.5 2.5L11 5L13.5 7.5", 1.9),
  },
  "heart-plus-blade": {
    means:
      "Life Attunement: a hollow heart with a plus and a short blade: healed more, hits softer.",
    draw: () =>
      `<g transform="translate(-1,-3)"><path d="${HEART_D}" ${stroke(C.ink, 2)}/></g>` +
      inkLine("M10 10V16M7 13H13", 2) +
      inkLine("M14 22L22 14", 2.2) +
      inkLine("M17 14L22 19", 1.8),
  },
  "halo-heart": {
    means: "Aura of Faith: a halo over a heart: healed more, hurt less.",
    draw: () =>
      `<ellipse cx="12" cy="4.5" rx="6" ry="2.2" ${stroke(C.ink, 2)}/>` + heart(12, 15, 0.95),
  },
  "hourglass-chevrons": {
    means: "Peace and Harmony: an hourglass with chevrons: conditions and hexes run out fast.",
    draw: () =>
      inkLine("M3 3H13M3 21H13", 2.2) +
      inkLine(
        "M4.5 3C4.5 9 11.5 10 11.5 12S4.5 15 4.5 21M11.5 3C11.5 9 4.5 10 4.5 12S11.5 15 11.5 21",
        1.9,
      ) +
      inkLine("M15 6L19 12L15 18M19 6L23 12L19 18", 2),
  },
};

export default glyphs;
