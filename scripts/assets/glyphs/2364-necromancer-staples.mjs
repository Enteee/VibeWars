// Glyphs (#2364): the stand-ins of #2313.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "chalice-drop": {
    means: "Unholy Feast: a solid chalice with a drop in it: a feast of blood that heals.",
    draw: () =>
      inkFill("M4 3H20C20 10 17 14 12 14C7 14 4 10 4 3Z") +
      inkLine("M12 14V20", 2.4) +
      inkFill("M6 20H18V22H6Z") +
      `<path d="M12 5C13.500 7 14 7.500 14 8.500A2 2 0 0 1 10 8.500C10 7.500 10.500 7 12 5Z" fill="${C.bg}"/>`,
  },
  "bowl-bones": {
    means:
      "Feast of Corruption: two crossed bones over a solid bowl: a feast on the dead that spreads corruption.",
    draw: () =>
      inkFill("M3 13H21C21 19 17 22 12 22C7 22 3 19 3 13Z") +
      inkLine("M6 3L18 10M18 3L6 10", 2.2) +
      inkFill(
        "M4 2A1.500 1.500 0 1 1 7 4A1.500 1.500 0 1 1 4 2ZM17 2A1.500 1.500 0 1 1 20 4A1.500 1.500 0 1 1 17 2Z",
      ) +
      inkFill(
        "M4 9A1.500 1.500 0 1 1 7 11A1.500 1.500 0 1 1 4 9ZM17 9A1.500 1.500 0 1 1 20 11A1.500 1.500 0 1 1 17 9Z",
      ),
  },
  "slab-germ": {
    means:
      "Tainted Flesh: a solid shield-shaped slab of flesh with a germ cut into it: disease held and passed on.",
    draw: () =>
      inkFill("M4 5L12 2L20 5V13C20 18 16 21 12 22C8 21 4 18 4 13Z") +
      `<circle cx="12" cy="12" r="3" ${stroke(C.bg, 1.8)}/>` +
      `<path d="M12 6.500V8.500M12 15.500V17.500M6.500 12H8.500M15.500 12H17.500" ${stroke(C.bg, 1.8)}/>`,
  },
  "drop-halo": {
    means: "Dark Aura: a solid drop inside a broken ring: blood that strikes back.",
    draw: () =>
      inkFill("M12 6C15 10 16.500 12 16.500 14A4.500 4.500 0 0 1 7.500 14C7.500 12 9 10 12 6Z") +
      inkLine(
        "M12 1.500A10.500 10.500 0 0 1 22.500 12M22.500 13A10.500 10.500 0 0 1 12 23.500M12 22.500A10.500 10.500 0 0 1 1.500 12M1.500 11A10.500 10.500 0 0 1 12 1.500",
        2,
      ),
  },
  "drops-pass": {
    means:
      "Life Transfer: a big drop, an arrow and a small drop: Health drawn from one and given to another.",
    draw: () =>
      inkFill("M7 4C11 10 13 12 13 15A6 6 0 0 1 1 15C1 12 3 10 7 4Z") +
      inkLine("M14 12H19M17 9.500L19.500 12L17 14.500", 2) +
      inkFill("M19 16C21 19 22 20 22 21A3 3 0 0 1 16 21C16 20 17 19 19 16Z"),
  },
  "horned-orb": {
    means: "Demonic Flesh: a solid orb with two horns and a cut-out glare: a hellish hide.",
    draw: () =>
      inkFill("M12 7A8 8 0 1 1 12 23A8 8 0 1 1 12 7Z") +
      inkFill("M5 11L3 2L10 8ZM19 11L21 2L14 8Z") +
      `<path d="M7 14L11 16M17 14L13 16" ${stroke(C.bg, 2)}/>`,
  },
  "leg-buckle": {
    means:
      "Weaken Knees: a bent leg with a crack at the knee and a falling arrow: legs that give way.",
    draw: () =>
      inkLine("M7 2V11L13 16V22", 3.4) +
      `<path d="M4 9L11 13" ${stroke(C.bg, 1.6)}/>` +
      inkLine("M19 4V11", 2.2) +
      inkFill("M15.500 10H22.500L19 16Z"),
  },
};

export default glyphs;
