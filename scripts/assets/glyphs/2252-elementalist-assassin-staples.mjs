// Glyphs (#2252): the Elementalist staples of #2232 and the Assassin staples
// of #2233.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** A small caltrop (four spikes round a hub), centred on (x, y), `k` times the size drawn. @param {number} x @param {number} y @param {number} k */
const jack = (x, y, k) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)})">` +
  inkFill("M0 -8L2.2 -2.2L8 0L2.2 2.2L0 8L-2.2 2.2L-8 0L-2.2 -2.2Z") +
  "</g>";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "flame-faceted": {
    means:
      "Obsidian Flame: a flame cut from glass, all straight edges and a split down the middle: fire that ignores armor.",
    draw: () =>
      inkFill("M12 2L17 8L15.5 11L20 15L16 22H8L4 15L8.5 11L7 8Z") +
      `<path d="M12 8L10.5 14L13.5 17L12 22" ${stroke(C.bg, 1.4)}/>`,
  },
  "bolt-strike": {
    means:
      "Invoke Lightning: a bolt from above landing on a ground line, with an arc spreading either side: the target and its neighbours are struck.",
    draw: () =>
      inkFill("M14 1.5L7 12H12L9.5 18.5L17 9H12.5Z") +
      inkLine("M3 21.5H21", 2.4) +
      inkLine("M3.5 17C5 18 6 18 7 17.5M20.5 17C19 18 18 18 17 17.5", 1.8),
  },
  "gust-frost": {
    means:
      "Teinai's Wind: three gust lines curling forward, a snow cross at their head: a cold wind that hits foes together.",
    draw: () =>
      inkLine("M2 7H12A3 3 0 1 0 9.5 4M2 12H15A3 3 0 1 1 12.5 15M2 17H9", 2.2) +
      inkLine("M19 5V13M15.5 7L22.5 11M15.5 11L22.5 7", 1.9),
  },
  "gem-wave": {
    means:
      "Crystal Wave: a cut gem riding over two waves: a crystal surge that strikes and cleanses.",
    draw: () =>
      inkFill("M7 2H17L21 7L12 15L3 7Z") +
      `<path d="M3 7H21M9.5 2L8 7L12 15L16 7L14.5 2" ${stroke(C.bg, 1)}/>` +
      inkLine(
        "M2.5 18.5Q5.5 16 8.5 18.5T14.5 18.5T21.5 18.5M2.5 22Q5.5 19.5 8.5 22T14.5 22T21.5 22",
        1.8,
      ),
  },
  "starburst-bolt": {
    means:
      "Energy Blast: a starburst with a bolt cut out of its heart: all your Energy let go in one blow.",
    draw: () =>
      inkFill(
        "M12 1L14.2 7L20 4L17 9.8L23 12L17 14.2L20 20L14.2 17L12 23L9.8 17L4 20L7 14.2L1 12L7 9.8L4 4L9.8 7Z",
      ) + `<path d="M13 5L8 12.5H11.8L10.8 19L16 11H12.4Z" fill="${C.bg}"/>`,
  },
  "snake-bite": {
    means:
      "Entangling Asp: a snake in an S, fangs bared, a drop beneath: knocked down and poisoned.",
    draw: () =>
      inkLine("M18 5C18 2 6 2 6 8S18 12 18 17C18 20 10 21 6 20", 2.8) +
      inkFill("M17 3.5L21.5 5.5L18.5 7.6Z") +
      `<circle cx="18.2" cy="5.3" r="0.9" fill="${C.bg}"/>` +
      inkFill("M5 22L7 22L6 19.5Z"),
  },
  "rings-slashed": {
    means:
      "Assault Enchantments: two enchantment rings, each split open with a blade-stroke through the gap: every enchantment cut away.",
    draw: () =>
      `<path d="M9 5.5A4.6 4.6 0 1 0 11.6 9.5" ${stroke(C.ink, 2.4)}/>` +
      `<path d="M20 13.5A4.6 4.6 0 1 0 22 17.5" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M2 22L22 2", 2.2),
  },
  "caltrop-hex": {
    means:
      "Hidden Caltrops: a caltrop sitting in a dashed hex ring: a foe slowed, and crippled when the hex ends.",
    draw: () =>
      `<circle cx="12" cy="12" r="9.5" ${stroke(C.ink, 2.2)} stroke-dasharray="4.6 3.4"/>` +
      jack(12, 12, 0.95),
  },
};

export default glyphs;
