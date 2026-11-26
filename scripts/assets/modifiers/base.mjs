// Modifiers (#719, #2021): drawn around a skill icon's bottom right corner, on a dark disc.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, pawPrint } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  up: {
    means: "up",
    draw: () => inkLine("M19 21V15M16.5 17.5L19 15L21.5 17.5", 1.7),
  },
  down: {
    means: "down",
    draw: () => inkLine("M19 15V21M16.5 18.5L19 21L21.5 18.5", 1.7),
  },
  plus: {
    means: "A plus: it heals as it works (#996).",
    draw: () => inkLine("M19 15.4V20.6M16.4 18H21.6", 1.7),
  },
  paw: {
    means: "A small paw: the blow is the pet's (#1215).",
    draw: () =>
      `<g transform="translate(19,18) scale(0.3) translate(-12,-11.5)">${pawPrint(C.ink)}</g>`,
  },
  half: {
    means: "A half disc: below half Health (#1036).",
    draw: () =>
      `<circle cx="19" cy="18" r="3.4" ${stroke(C.ink, 1.5)}/><path d="M19 18H15.6A3.4 3.4 0 0 0 22.4 18Z" fill="${C.ink}"/>`,
  },
  bolt: {
    means: "An energy bolt: it takes energy (#1018).",
    draw: () => inkFill("M20 14.2L16.4 18.4H19L18.2 21.8L22 17.4H19.4Z"),
  },
  corpse: {
    means: "A small skull: it works on a corpse (#1075). The modifier for corpse skills.",
    draw: () =>
      inkFill("M19 14.8a3.4 3.4 0 0 1 2.1 6.1V22h-4.2v-1.1A3.4 3.4 0 0 1 19 14.8z") +
      `<circle cx="17.7" cy="18.1" r="0.9" fill="${C.bg}"/><circle cx="20.3" cy="18.1" r="0.9" fill="${C.bg}"/>`,
  },
  less: {
    means: "less",
    draw: () => inkLine("M16.5 18H21.5", 2),
  },
  area: {
    means: "area",
    draw: () => `<circle cx="19" cy="18" r="3.4" ${stroke(C.ink, 1.6)}/>`,
  },
  clock: {
    means: "clock",
    draw: () =>
      `<circle cx="19" cy="18" r="3.6" ${stroke(C.ink, 1.5)}/>` + inkLine("M19 16V18H20.8", 1.4),
  },
  stun: {
    means: "stun",
    draw: () =>
      [16.2, 19, 21.8]
        .map((x) => `<circle cx="${String(x)}" cy="18" r="1.15" fill="${C.ink}"/>`)
        .join(""),
  },
  bleed: {
    means: "bleed",
    draw: () =>
      `<path d="M19 14.6C19 14.6 15.8 18 15.8 19.8A3.2 3.2 0 0 0 22.2 19.8C22.2 18 19 14.6 19 14.6Z" fill="${C.ink}"/>`,
  },
  self: {
    means: "self",
    draw: () =>
      `<circle cx="19" cy="18" r="3.4" ${stroke(C.ink, 1.5)}/><circle cx="19" cy="18" r="1.2" fill="${C.ink}"/>`,
  },
  hourglass: {
    means: "An hourglass: it acts when its time runs out (#944).",
    draw: () => inkLine("M16.8 15H21.2L16.8 21H21.2Z", 1.4),
  },
  renew: {
    means: "A turning arrow: a refrain renews itself each time a chant ends (#1482).",
    draw: () =>
      `<path d="M21.6 18A2.6 2.6 0 1 1 19 15.4" ${stroke(C.ink, 1.5)}/>` +
      inkFill("M18.2 13.6L21 15.4L18.2 17.2Z"),
  },
  take: {
    means: "An arrow pulling a dot toward you: it takes what another has (#1999).",
    draw: () =>
      `<circle cx="21.4" cy="18" r="1.4" fill="${C.ink}"/>` +
      inkLine("M20 18H16M17.8 16L16 18L17.8 20", 1.6),
  },
  finale: {
    means: "A four-point spark: a finale fires once, when the chant ends (#1482).",
    draw: () =>
      inkFill("M19 14.2L20.1 16.9L22.8 18L20.1 19.1L19 21.8L17.9 19.1L15.2 18L17.9 16.9Z"),
  },
  upkeep: {
    means: "A loop: maintained, it lasts until ended (#837).",
    draw: () =>
      `<path d="M19 18c-1-1.5-3.4-1.5-3.4 0s2.4 1.5 3.4 0 3.4-1.5 3.4 0-2.4 1.5-3.4 0z" ${stroke(C.ink, 1.4)}/>`,
  },
};

export default glyphs;
