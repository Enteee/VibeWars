// Glyphs (#2193): the Mesmer interrupts of #2165. One family, the interrupt
// burst, told apart by what follows the interrupt.

import { C, stroke } from "../icon-kit.mjs";
import { HEX_RING, glyph, inkLine } from "../glyph-kit.mjs";

/** The interrupt burst at (x, y), scaled by s. @param {number} x @param {number} y @param {number} s */
const burstAt = (x, y, s) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(s)}) translate(-12,-12)">${glyph("interrupt")}</g>`;

/** A padlock, body centred on (x, y): the skill stays locked. @param {number} x @param {number} y */
const padlock = (x, y) => {
  const n = (/** @type {number} */ v) => String(v);
  return (
    `<path d="M${n(x - 3.2)} ${n(y - 2.5)}V${n(y - 5)}A3.2 3.2 0 0 1 ${n(x + 3.2)} ${n(y - 5)}V${n(y - 2.5)}" ${stroke(C.ink, 2.2)}/>` +
    `<rect x="${n(x - 5)}" y="${n(y - 2.5)}" width="10" height="8" rx="1.2" fill="${C.ink}"/>` +
    `<circle cx="${n(x)}" cy="${n(y + 1.5)}" r="1.3" fill="${C.bg}"/>`
  );
};

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "interrupt-lock": {
    means: "Power Lock: a broken spell and a padlock: interrupted, and locked a long time.",
    draw: () => burstAt(8.5, 8.5, 0.72) + padlock(16.5, 16),
  },
  "signet-interrupt-stack": {
    means:
      "Signet of Distraction: a signet ring round the burst, more rings stacked under it: each signet you carry locks it longer.",
    draw: () =>
      `<circle cx="10" cy="10" r="8" ${stroke(C.ink, 2.2)}/>` +
      burstAt(10, 10, 0.5) +
      `<circle cx="17" cy="19.5" r="2.6" ${stroke(C.ink, 1.8)}/>` +
      `<circle cx="21" cy="15" r="2.2" ${stroke(C.ink, 1.6)}/>`,
  },
  "interrupt-spread": {
    means:
      "Complicate: one burst, and three smaller ones flung out: the skill is locked on every foe near.",
    draw: () =>
      burstAt(12, 12, 0.6) +
      burstAt(4.5, 4.5, 0.38) +
      burstAt(19.5, 4.5, 0.38) +
      burstAt(12, 20, 0.38),
  },
  "hex-web-interrupts": {
    means:
      "Web of Disruption: a hex web with a burst at each end of a thread: it interrupts when cast and again when it ends.",
    draw: () =>
      HEX_RING +
      inkLine("M12 4V20M5 8L19 16M19 8L5 16", 1.4) +
      burstAt(7, 7, 0.5) +
      burstAt(17, 17, 0.5),
  },
};

export default glyphs;
