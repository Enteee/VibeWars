// Glyphs (#2178): the Paragon riders and the Warrior shouts that were on stand-ins.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, smallFigure, smallSkull, healthGauge, glyph } from "../glyph-kit.mjs";

const SHIELD = "M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "heart-wings": {
    means: "A heart between two wings: the death turned aside (Angelic Bond).",
    draw: () =>
      inkFill("M12 20L6 14a3.4 3.4 0 0 1 6-3.4 3.4 3.4 0 0 1 6 3.4z") +
      `<ellipse cx="12" cy="5" rx="3.2" ry="1.3" ${stroke(C.ink, 1.6)}/>` +
      inkLine("M5.5 12.5C3.5 11 2.5 8.5 2 5C5 5.5 7 7 8.5 9.5", 2) +
      inkLine("M18.5 12.5C20.5 11 21.5 8.5 22 5C19 5.5 17 7 15.5 9.5", 2),
  },
  "ring-speed": {
    means: "Two chevrons inside a ring: the enchanted are the ones who hurry (Godspeed).",
    draw: () =>
      `<circle cx="12" cy="12" r="9.5" ${stroke(C.ink, 2)}/>` +
      inkLine("M7.5 8L11.5 12L7.5 16M12.5 8L16.5 12L12.5 16", 2.4),
  },
  "figure-lead": {
    means: "One figure, chevrons ahead of it: a single ally is led (Lead the Way).",
    draw: () =>
      smallFigure(6.5, 12, 0.85) +
      inkLine("M13.5 5.5L19 12L13.5 18.5M17.5 5.5L23 12L17.5 18.5", 2.4),
  },
  "heart-bolt": {
    means: "A heart with a plus and a bolt: healed, and your spells on it cast faster (Help!).",
    draw: () =>
      `<g transform="translate(9,14) scale(0.85) translate(-12,-12)">${glyph("heart-plus")}</g>` +
      inkFill("M20 1.5L13 10.5H17.5L15.5 17.5L23 7.5H18.5Z"),
  },
  "shield-burst": {
    means:
      "A shield with rays spreading from both sides: the foes beside it are hit (Brace Yourself!).",
    draw: () =>
      `<g transform="translate(12,12) scale(0.72) translate(-12,-12)"><path d="${SHIELD}" ${stroke(C.ink, 2.8)}/></g>` +
      inkLine(
        "M1.5 5.5L4 7.5M1 12H3.5M1.5 18.5L4 16.5M22.5 5.5L20 7.5M23 12H20.5M22.5 18.5L20 16.5",
        2,
      ),
  },
  "sword-heart": {
    means:
      "A sword over a full heart: stronger when you have more Health than the target (Thrill of Victory).",
    draw: () =>
      `<g transform="translate(14,10) scale(0.85) translate(-12,-12)">${glyph("sword")}</g>` +
      inkFill("M6.5 22L1.5 17a3 3 0 0 1 5-3.4 3 3 0 0 1 5 3.4z"),
  },
  "shout-skull-gauge": {
    means:
      "Shout arcs, a skull, a health bar nearly full: for the foe who has not yet lost a tenth (You Will Die!).",
    draw: () =>
      inkLine("M2.5 3.5C5 5.5 5 8.5 2.5 10.5", 1.8) + smallSkull(14, 9, 0.7) + healthGauge(0.85),
  },
  "figure-alone": {
    means: "A lone figure inside a dashed empty ring: nobody stands beside it (You're All Alone!).",
    draw: () =>
      `<circle cx="12" cy="12" r="10" ${stroke(C.ink, 2)} stroke-dasharray="2.2 3.6"/>` +
      smallFigure(12, 12.5, 0.7),
  },
  "chevrons-back": {
    means: "Shout arcs behind two chevrons running the other way: the party falls back (Retreat!).",
    draw: () =>
      inkLine("M21 8C23.5 10 23.5 13 21 15", 1.8) + inkLine("M15 5L9 12L15 19M9 5L3 12L9 19", 2.4),
  },
  "figure-shields": {
    means:
      "A figure with a shield at each side: the allies beside you block (Protector's Defense).",
    draw: () =>
      smallFigure(12, 13, 0.75) +
      `<g transform="translate(4.5,12) scale(0.55) translate(-12,-12)">${inkFill(SHIELD)}</g>` +
      `<g transform="translate(19.5,12) scale(0.55) translate(-12,-12)">${inkFill(SHIELD)}</g>`,
  },
};

export default glyphs;
