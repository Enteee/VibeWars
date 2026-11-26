// Glyphs (#2215): the Monk protection staples of #2187. The hex and the
// condition stay apart by the house shapes: a dashed ring is a hex, a drop
// is a condition; a tick inside says it is cleared.

import { C, stroke } from "../icon-kit.mjs";
import { HEX_RING, burst, inkFill, inkLine } from "../glyph-kit.mjs";

/** The shield outline, 24 box. @param {number} w */
const shieldLine = (w) =>
  `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, w)}/>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "shield-bounce": {
    means:
      "Reversal of Damage: a shield, and an arrow striking it and bouncing back the way it came: the hit turned on its sender.",
    draw: () =>
      shieldLine(2) +
      inkLine("M1.5 4L12 14", 2.4) +
      inkLine("M12 14L20 6", 2.4) +
      inkFill("M22.5 3.5L21.5 9L16.5 5.5Z"),
  },
  "hex-clear-tick": {
    means:
      "Spotless Mind: the dashed hex ring with a tick in it: the hex is cleared (the pulse is the modifier).",
    draw: () => HEX_RING + inkLine("M7.5 12.5L11 16L17 8.5", 2.6),
  },
  "drop-clear-tick": {
    means:
      "Spotless Soul: a condition drop outlined, with a tick in it: the condition is cleared (the pulse is the modifier).",
    draw: () =>
      `<path d="M12 2.5C16 8.5 19 12 19 15.5A7 7 0 0 1 5 15.5C5 12 8 8.5 12 2.5Z" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M8.8 15L11.3 17.5L15.5 12", 2.4),
  },
  "burst-to-plus": {
    means:
      "Mark of Protection: a damage burst, an arrow, and a heal plus: the damage taken is turned into healing.",
    draw: () =>
      `<g transform="translate(-1.5,1) scale(0.55) translate(-0,0)">${inkFill(burst(6))}</g>` +
      inkLine("M9.5 12H14", 2.2) +
      inkLine("M16.5 7.5V16.5M12 12H21", 3),
  },
  "shield-link": {
    means:
      "Protective Bond: a shield held on a chain: two linked rings under it, the bond that is paid for to keep it.",
    draw: () =>
      `<g transform="translate(6,-1) scale(0.7)">${shieldLine(2.8)}</g>` +
      `<rect x="2.5" y="12.5" width="9" height="5.5" rx="2.75" ${stroke(C.ink, 2)} transform="rotate(35 7 15)"/>` +
      `<rect x="6.5" y="15.5" width="9" height="5.5" rx="2.75" ${stroke(C.ink, 2)} transform="rotate(35 11 18)"/>`,
  },
};

export default glyphs;
