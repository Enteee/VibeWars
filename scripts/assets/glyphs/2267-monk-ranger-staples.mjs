// Glyphs (#2267): the Monk and Ranger staples of #2189 and #2190.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, burst, smallFigure, smallSkull, glyph } from "../glyph-kit.mjs";

const SHIELD = "M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "shield-spark": {
    means:
      "Spell Shield: a shield with a four-point spell star on it: spells cannot reach you while you cast.",
    draw: () =>
      `<path d="${SHIELD}" ${stroke(C.ink, 2.4)}/>` +
      inkFill("M12 7L13.8 11L18 12L13.8 13L12 17.5L10.2 13L6 12L10.2 11Z"),
  },
  "figure-hex-off": {
    means:
      "Withdraw Hexes: an ally with a dashed hex ring struck out beside them: every hex lifted from them and their neighbours.",
    draw: () =>
      smallFigure(8, 14, 0.85) +
      `<circle cx="17" cy="7.5" r="4.5" ${stroke(C.ink, 2)} stroke-dasharray="3 2.4"/>` +
      inkLine("M13 4L21.5 11.5", 2),
  },
  "hex-to-shield": {
    means:
      "Convert Hexes: a dashed hex ring, an arrow, a filled shield: the hex is gone and armor takes its place.",
    draw: () =>
      `<circle cx="5.5" cy="12" r="3.8" ${stroke(C.ink, 2)} stroke-dasharray="2.6 2"/>` +
      inkLine("M10.5 12H13", 2.2) +
      inkFill("M18 4L22.5 5.8V11C22.5 14.5 20.5 17 18 18.5C15.5 17 13.5 14.5 13.5 11V5.8Z"),
  },
  "shield-chevrons": {
    means:
      "Shield of Absorption: a shield with two chevrons pointing down inside it: every hit lands a little lighter.",
    draw: () =>
      `<path d="${SHIELD}" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M8 8.5L12 12L16 8.5M8 13L12 16.5L16 13", 2.2),
  },
  "skull-halo": {
    means: "Divine Intervention: a skull under a halo: the fatal blow is turned aside.",
    draw: () =>
      `<ellipse cx="12" cy="3.8" rx="5.5" ry="2" ${stroke(C.ink, 1.8)}/>` +
      smallSkull(12, 14, 0.85),
  },
  "burst-plus": {
    means:
      "Healing Hands: a hit burst, an arrow and a plus: every blow taken is answered with a heal.",
    draw: () =>
      `<g transform="translate(6.5,12) scale(0.5) translate(-12,-12)">${inkFill(burst(6))}</g>` +
      inkLine("M11.5 12H13", 2) +
      inkLine("M18 7V17M13 12H23", 3.2),
  },
  "shield-fallen": {
    means:
      "Shield of Judgment: a shield above a ground bar with a bolt beside it: whoever strikes is knocked down and smitten.",
    draw: () =>
      `<g transform="translate(8.5,9.5) scale(0.7) translate(-12,-12)"><path d="${SHIELD}" ${stroke(C.ink, 3)}/></g>` +
      inkFill("M20 3L15 10.5H19L17 17L23 8.5H19Z") +
      inkLine("M2 21H22", 3),
  },
  "leaf-rise": {
    means:
      "Melandru's Resilience: a leaf over two rising bars: regeneration that grows with what afflicts you.",
    draw: () => inkFill("M3 14C3 7 8 3 15 3C15 11 11 16 3 14Z") + inkLine("M15 21V15M20 21V10", 3),
  },
  "bow-focus": {
    means:
      "Expert Focus: a bow with its arrow nocked and a small ring at the tip: cheaper shots that hit harder.",
    draw: () =>
      inkLine("M6 3C17 7 17 17 6 21M6 3V21", 2) +
      inkLine("M3 12H18", 2) +
      inkFill("M23 12L16.5 8.5V15.5Z"),
  },
  "arrows-pair": {
    means: "Rapid Fire: two arrows flying side by side: the bow attacks faster.",
    draw: () => inkLine("M2 8H15M2 16H15", 2.4) + inkFill("M22.5 8L14.5 4V12ZM22.5 16L14.5 12V20Z"),
  },
  "arrow-into-crack": {
    means:
      "Disrupting Shot: an arrow driving into a skill square that splits: the foe's action is cut off.",
    draw: () =>
      `<path d="M10 3H22V15H10Z" ${stroke(C.ink, 2)}/>` +
      inkLine("M17 3L15.5 8L18.5 10L16.5 15", 1.8) +
      inkLine("M2.5 21.5L11 13", 2.2) +
      inkFill("M13.5 10.5L8.5 11.5L12.5 15.5Z"),
  },
  "volley-flame": {
    means:
      "Incendiary Arrows: three short arrows loosed together, a flame in front of them: burning shots at three foes.",
    draw: () =>
      `<g transform="translate(10,13) scale(0.85) translate(-12,-12)">${glyph("volley")}</g>` +
      inkFill(
        "M19 1.5c.4 2.3 2.8 3.3 2.8 5.8a3.8 3.8 0 0 1-7.6 0c0-1.5.6-2.7 1.6-3.4 0 1.3.4 1.9 1 2.2-.3-1.8.6-3.7 2.2-4.6z",
      ),
  },
  "arrow-lock": {
    means:
      "Marauder's Shot: a heavy arrow and a padlock: a big hit, then every other skill is locked for a while.",
    draw: () =>
      inkLine("M10 14L19 5", 3.4) +
      inkFill("M23 1.5L12.5 5L19.5 12Z") +
      inkFill("M3 15H11V22H3Z") +
      inkLine("M4.8 15V12.8a2.2 2.2 0 0 1 4.4 0V15", 1.8),
  },
  "figure-arrow": {
    means:
      "Body Shot: an arrow going into a figure's chest: extra damage, and Energy back when the armor is cracked.",
    draw: () =>
      smallFigure(8, 13, 0.95) +
      inkLine("M22 3L14 10", 2.2) +
      inkFill("M11 12L12.5 6.5L16.5 10.5Z"),
  },
  "arrow-streaks": {
    means: "Quick Shot: an arrow with long streaks behind it: it flies twice as fast.",
    draw: () =>
      inkLine("M2 7H8M2 12H6M2 17H8", 2.2) +
      inkLine("M8 12H17", 2.6) +
      inkFill("M23 12L15 7.5V16.5Z"),
  },
  "eye-claws": {
    means:
      "Tiger's Fury: a slit-pupilled eye over three claw gashes: the cat attacks faster and cannot use its other skills.",
    draw: () =>
      inkLine("M2 8C6 3 18 3 22 8C18 13 6 13 2 8Z", 2) +
      inkFill("M12 4.2Q14.2 8 12 11.8Q9.8 8 12 4.2Z") +
      inkLine("M5.5 15L4.5 21.5M12 15V21.5M18.5 15L19.5 21.5", 2.4),
  },
};

export default glyphs;
