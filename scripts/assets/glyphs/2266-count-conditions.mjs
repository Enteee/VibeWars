// Glyphs (#2266): the count-condition skills of #2247 and the corpse skills of #2250.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, smallSkull } from "../glyph-kit.mjs";

/** A drop centred on (x, y), `k` times the full-grid drop. @param {number} x @param {number} y @param {number} k */
const drop = (x, y, k) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-12)">` +
  inkFill("M12 2.5C16 8.5 19 12 19 15.5A7 7 0 0 1 5 15.5C5 12 8 8.5 12 2.5Z") +
  "</g>";

/** A dashed hex ring centred on (x, y). @param {number} x @param {number} y @param {number} r */
const hexRing = (x, y, r) =>
  `<circle cx="${String(x)}" cy="${String(y)}" r="${String(r)}" ${stroke(C.ink, 2)} stroke-dasharray="${(r * 0.55).toFixed(1)} ${(r * 0.4).toFixed(1)}"/>`;

/** A plain ring, an enchantment, centred on (x, y). @param {number} x @param {number} y @param {number} r */
const ring = (x, y, r) =>
  `<circle cx="${String(x)}" cy="${String(y)}" r="${String(r)}" ${stroke(C.ink, 2.2)}/>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "hex-for-ring": {
    means:
      "Signet of Twilight: a dashed hex ring, an arrow, a ring struck out: one enchantment lost for every hex on the foe.",
    draw: () =>
      hexRing(6.5, 12, 4.5) +
      inkLine("M12.5 12H15", 2.2) +
      ring(19, 12, 3.4) +
      inkLine("M15.5 16L22.5 8", 2),
  },
  "drop-for-drop": {
    means:
      "Signet of Malice: a filled drop, an arrow, a drop struck out: one condition cured on you for every one on the foe.",
    draw: () =>
      drop(6, 12, 0.6) +
      inkLine("M12 12H14.5", 2.2) +
      drop(18.5, 12, 0.6) +
      inkLine("M14.5 17L22.5 7", 2),
  },
  "drops-bolt": {
    means:
      "Signet of Deadly Corruption: a column of drops beside a heavy bolt: damage for every condition on the foe.",
    draw: () =>
      drop(6, 5.5, 0.4) +
      drop(6, 12, 0.4) +
      drop(6, 18.5, 0.4) +
      inkFill("M17 2L10 13H15.5L13.5 22L21.5 10H16Z"),
  },
  "rings-wound": {
    means:
      "Accumulated Pain: two hex rings overlapping above a drop: a Deep Wound once two hexes sit on the foe.",
    draw: () => hexRing(8.5, 8, 5) + hexRing(15.5, 8, 5) + drop(12, 19, 0.5),
  },
  "scales-rings": {
    means:
      "Lyssa's Balance: a pair of scales with an enchantment ring in each pan: it strips only if you hold no more than the foe.",
    draw: () =>
      inkLine("M3 7H21M12 4V20M7.5 21H16.5", 2.2) +
      inkLine("M3 7L1.5 13H7.5ZM21 7L16.5 13H22.5Z", 1.4) +
      ring(4.5, 16.5, 2.2) +
      ring(19.5, 16.5, 2.2),
  },
  "ring-drop-bolt": {
    means:
      "Discord: a hex ring over a drop, a bolt beside them: damage to a foe that has both a condition and a hex or enchantment.",
    draw: () =>
      hexRing(7, 7.5, 4.5) + drop(7, 18, 0.55) + inkFill("M18 2L11.5 13H16.5L14.5 22L22 10H17Z"),
  },
  "skull-recharge": {
    means:
      "Signet of Sorrow: a skull with a recharge loop: the signet is ready again at once beside a corpse.",
    draw: () =>
      smallSkull(9, 9, 0.62) +
      inkLine("M21 17.5A5 5 0 1 1 19.5 13", 2.2) +
      inkLine("M21.8 10.5V14.5H17.8", 2.2),
  },
  "skull-dart": {
    means: "Animate Bone Fiend: a skull loosing a bone dart: a minion that fights at range.",
    draw: () => smallSkull(8.5, 12, 0.72) + inkLine("M15.5 12H22M19.5 9L22.5 12L19.5 15", 2.2),
  },
};

export default glyphs;
