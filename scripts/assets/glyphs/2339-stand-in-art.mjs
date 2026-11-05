// Glyphs (#2339): the stand-ins of #2289.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "shield-frost": {
    means: "Armor of Frost: a solid shield with a snowflake cut out of it: cold armor.",
    draw: () =>
      inkFill("M12 2L21 5.500V12C21 17 17 20.500 12 22C7 20.500 3 17 3 12V5.500Z") +
      `<path d="M12 6.500V17.500M7.200 9.200L16.800 14.800M7.200 14.800L16.800 9.200" ${stroke(C.bg, 1.8)}/>`,
  },
  "phoenix-wings": {
    means: "Phoenix: a bird with spread wings over a flame tail: fire that strikes and flies on.",
    draw: () =>
      inkFill(
        "M12 12C10 8 6 5.500 2 5C3 11 6.500 14 12 15ZM12 12C14 8 18 5.500 22 5C21 11 17.500 14 12 15Z",
      ) +
      inkFill("M12 10L10.500 14.500L12 22L13.500 14.500Z") +
      `<circle cx="12" cy="5.500" r="2.200" fill="${C.ink}"/>`,
  },
  "link-flame": {
    means: "Incendiary Bonds: two chain links with a flame on top: a tether that burns.",
    draw: () =>
      `<rect x="3" y="12" width="11" height="6.500" rx="3.250" transform="rotate(-30 8.500 15.250)" ${stroke(C.ink, 2.2)}/>` +
      `<rect x="10" y="9" width="11" height="6.500" rx="3.250" transform="rotate(-30 15.500 12.250)" ${stroke(C.ink, 2.2)}/>` +
      inkFill(
        "M17 2C19.500 5 20.500 6.500 20.500 8A3.500 3.500 0 0 1 13.500 8C13.500 6.500 15 5 17 2Z",
      ),
  },
  "stone-spikes": {
    means: "Stone Daggers: three stone spikes rising from broken ground: earth that stabs.",
    draw: () =>
      inkFill("M3 19L6 8L9 19ZM9.500 19L12.500 2.500L15.500 19ZM16 19L18.500 10L21 19Z") +
      inkLine("M2 21.500H22", 2),
  },
  "star-four": {
    means:
      "Star Burst: a four-point star low on the left, throwing three long sparks up and right.",
    draw: () =>
      inkFill("M8 10L9.700 14.300L14 16L9.700 17.700L8 22L6.300 17.700L2 16L6.300 14.300Z") +
      inkLine("M13 12L21 3M14 8L19 8M9 6L9 2", 2),
  },
  "signet-rust": {
    means: "Rust: a signet ring eaten at the rim, with flakes falling off it.",
    draw: () =>
      `<path d="M16.500 8A7 7 0 1 0 19 13" ${stroke(C.ink, 3)}/>` +
      inkLine("M11 8L9.500 12L13 13.500L11.500 17", 2) +
      inkFill("M19 5H22V8H19ZM20.500 10H22.500V12H20.500ZM17 2H19V4H17Z"),
  },
};

export default glyphs;
