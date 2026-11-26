// Glyphs (#2261): the Dervish staples of #2207 and #2217.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

const HEART = "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z";

/** A heart scaled by `k` and centred on (x, y). @param {number} x @param {number} y @param {number} k @param {string} body */
const heartAt = (x, y, k, body) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-14)">${body}</g>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "plus-orbit": {
    means:
      "Mystic Healing: a plus with three dots around it: you are healed, and so is every enchanted ally.",
    draw: () =>
      inkLine("M12 7.5V16.5M7.5 12H16.5", 3.4) +
      `<circle cx="4.5" cy="5" r="2.2" fill="${C.ink}"/>` +
      `<circle cx="19.5" cy="5" r="2.2" fill="${C.ink}"/>` +
      `<circle cx="12" cy="21" r="2.2" fill="${C.ink}"/>`,
  },
  "heart-pair": {
    means:
      "Imbue Health: a large filled heart and a small hollow one beside it: a share of your Health goes to an ally.",
    draw: () =>
      heartAt(
        8.5,
        15,
        0.8,
        `<path d="${HEART}" fill="${C.ink}" stroke="${C.bg}" stroke-width="1.2"/>`,
      ) + heartAt(17.5, 8, 0.55, `<path d="${HEART}" ${stroke(C.ink, 3.4)}/>`),
  },
  "heart-glare": {
    means:
      "Intimidating Aura: a heart with angry brows: more Health, and foes weaker than you hit softer.",
    draw: () =>
      `<path d="${HEART}" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M6.5 8.5L11 11.5L11 9ZM17.5 8.5L13 11.5L13 9Z"),
  },
  "bolt-glass": {
    means:
      "Eremite's Zeal: a bolt beside an hourglass: energy now, nothing for a while, energy again at the end.",
    draw: () => inkFill("M10 2.5L3 13H8.5L7 21.5L14 11H8.5Z") + inkLine("M15 4H21L15 20H21Z", 2),
  },
  "mouth-stitch": {
    means: "Vow of Silence: a mouth stitched shut: no spell goes out and none comes in.",
    draw: () =>
      inkLine("M2.5 12C6 6.5 18 6.5 21.5 12C18 17.5 6 17.5 2.5 12Z", 2.2) +
      inkLine("M7 9V15M12 8.2V15.8M17 9V15", 2.4),
  },
  "shield-drop": {
    means:
      "Conviction: a shield with a drop on it: armor and Health regeneration while afflicted, a cure at the end.",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.4)}/>` +
      inkFill("M12 7.5C14.5 10.5 15.5 12 15.5 13.8A3.5 3.5 0 0 1 8.5 13.8C8.5 12 9.5 10.5 12 7.5Z"),
  },
};

export default glyphs;
