// Glyphs (#2179): the Mesmer's energy and utility skills of #2132 and the
// Assassin's chain and Paradox tools of #2134.

import { C, stroke } from "../icon-kit.mjs";
import { HEX_RING, glyph, inkFill, inkLine } from "../glyph-kit.mjs";

/** A figure lying flat along the bottom: knocked down. */
const fallen = () =>
  `<circle cx="4.5" cy="19.5" r="2.4" fill="${C.ink}"/>` + inkLine("M8 19.5H20.5", 2.6);

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "signet-bolt-empty": {
    means:
      "Ether Signet: a signet ring round a bolt, over an Energy bar nearly drained: it pays only when you are out.",
    draw: () =>
      `<circle cx="12" cy="9" r="7.2" ${stroke(C.ink, 2)}/>` +
      inkFill("M13 3.5L8 10.5H11.5L10.5 14.5L15.5 7.5H12Z") +
      `<rect x="2.5" y="18.5" width="19" height="3.5" rx="1" ${stroke(C.ink, 1.8)}/>` +
      inkFill("M3.5 19.5H5.5V21H3.5Z"),
  },
  "interrupt-recharge": {
    means:
      "Persistence of Memory: a broken spell with an arrow coming round it: interrupted, it is ready again.",
    draw: () =>
      `<g transform="translate(12,12) scale(0.6) translate(-12,-12)">${glyph("interrupt")}</g>` +
      inkLine("M20 12A8 8 0 1 1 15 4.6", 2.2) +
      inkFill("M13 1.5L19 4.2L14.2 8.6Z"),
  },
  "interrupt-gives-energy": {
    means: "Power Return: a broken spell, and its Energy flung back to the foe.",
    draw: () =>
      `<g transform="translate(8,8) scale(0.66) translate(-12,-12)">${glyph("interrupt")}</g>` +
      inkLine("M12 12L14 14", 2.2) +
      `<g transform="translate(17,16.5) scale(0.62) translate(-12,-12)">${glyph("energy")}</g>`,
  },
  "eyes-slash": {
    means: "Signet of Midnight: two eyes, the foe's and yours, under one slash: both are Blinded.",
    draw: () =>
      `<path d="M2 8C4 5 6 4 8.5 4S13 5 15 8C13 11 11 12 8.5 12S4 11 2 8Z" ${stroke(C.ink, 2)}/>` +
      `<circle cx="8.5" cy="8" r="2" fill="${C.ink}"/>` +
      `<path d="M9 16C11 13 13 12 15.5 12S20 13 22 16C20 19 18 20 15.5 20S11 19 9 16Z" ${stroke(C.ink, 2)}/>` +
      `<circle cx="15.5" cy="16" r="2" fill="${C.ink}"/>` +
      inkLine("M4 21L20 3", 2.4),
  },
  "palm-empty": {
    means:
      "Way of the Empty Palm: an open palm, drawn hollow: the off-hand strikes come for nothing.",
    draw: () =>
      inkLine("M6 4V11M9.5 2.5V11M13 2.5V11M16.5 4V11", 2.2) +
      `<path d="M4 11H18V15.5C18 18.5 15.5 21 12.5 21H9.5C6.5 21 4 18.5 4 15.5Z" ${stroke(C.ink, 2.2)}/>`,
  },
  "hex-daggers": {
    means:
      "Mark of Instability: two crossed blades in a hex ring: the hex waits for a dual attack.",
    draw: () => HEX_RING + inkLine("M7.5 16.5L16.5 7.5M7.5 7.5L16.5 16.5", 2.8),
  },
  "dagger-barred-fast": {
    means:
      "Deadly Paradox: a blade barred out beside speed chevrons: no attacks, but faster skills.",
    draw: () =>
      inkLine("M3 17L11 9", 2.6) +
      inkLine("M2.5 10.5L11.5 18.5", 2.4) +
      inkLine("M12.5 4L17 8.5L12.5 13M17 4L21.5 8.5L17 13", 2.2),
  },
  "eye-slash-blade": {
    means: "Unseen Fury: a Blinded eye and a blade past it: those you blind cannot block you.",
    draw: () =>
      `<g transform="translate(8.5,8.5) scale(0.7) translate(-12,-12)">${glyph("eye-slash")}</g>` +
      `<g transform="translate(15,15) scale(0.66) translate(-12,-12)">${glyph("dagger")}</g>`,
  },
  "step-knockdown": {
    means:
      "Wastrel's Collapse: a shadow step's arrowhead over a foe lying flat: it lands, they fall.",
    draw: () =>
      inkFill("M12.5 3L22 8.5L12.5 14Z") + inkLine("M2 5H9M2 8.5H10M2 12H9", 1.8) + fallen(),
  },
};

export default glyphs;
