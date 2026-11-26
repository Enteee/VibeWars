// Glyphs (#2347): the stand-ins of #2316.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "blade-charge": {
    means: "Charging Strike: a blade thrust forward behind two chevrons: the blow of a charge.",
    draw: () =>
      inkLine("M2 7L6 12L2 17M7 7L11 12L7 17", 2) + inkFill("M13 9H19L22.500 12L19 15H13Z"),
  },
  "helm-impact": {
    means: "Headbutt: a helmet with a spiked impact burst in front of it: a blow with the head.",
    draw: () =>
      inkFill("M2 20V11A7 7 0 0 1 16 11V20Z") +
      `<path d="M7 13H16" ${stroke(C.bg, 1.8)}/>` +
      inkLine("M19 5L21 9M21.500 13H18.500M19 20L17.500 17", 1.8),
  },
  "axe-claw": {
    means: "Barbarous Slice: three parallel slashes across one axe cut: a savage blow.",
    draw: () => inkLine("M5 3L12 21M10 3L17 21M15 3L22 21", 2.6),
  },
  "signet-heart": {
    means: "Signet of Stamina: a signet ring with a heart as its stone: lasting health.",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)}/>` +
      `<path d="M12 17.500L7.500 13A2.800 2.800 0 0 1 12 9.500A2.800 2.800 0 0 1 16.500 13Z" fill="${C.ink}"/>`,
  },
  "banner-pennant": {
    means: "Soldier's Stance: a pennant on a pole: the soldier's standard held up.",
    draw: () => inkLine("M6 22V2", 2.4) + inkFill("M8 3L21 7.500L8 12Z") + inkLine("M3 22H10", 2.2),
  },
  "feet-planted": {
    means: "Steady Stance: two feet planted on level ground with brace marks: not knocked down.",
    draw: () =>
      inkFill("M3 12H10V19H3ZM14 12H21V19H14Z") +
      inkLine("M2 21.500H22", 2) +
      inkLine("M6.500 4V9M17.500 4V9", 2),
  },
  "heart-mane": {
    means: "Lion's Comfort: a heart ringed with a mane of rays: a lion's healing.",
    draw: () =>
      inkFill("M12 18L7.500 13.500A3 3 0 0 1 12 9.500A3 3 0 0 1 16.500 13.500Z") +
      inkLine("M12 2V5M4.500 5.500L6.500 8M19.500 5.500L17.500 8M2 12H5M22 12H19", 2),
  },
};

export default glyphs;
