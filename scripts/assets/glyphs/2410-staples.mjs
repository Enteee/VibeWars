// Glyphs (#2410): the stand-ins of #2406.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** The slam hammer of `hammer-slam`: handle, head, outline against the ground. */
const hammer = () =>
  inkLine("M7 3.5L12 10", 2.4) +
  `<rect x="9.500" y="8" width="9" height="6" rx="1" transform="rotate(35 14 11)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>`;

/** A drop, `k` times the full-grid one, centred on (x, y). @param {number} x @param {number} y @param {number} k */
const drop = (x, y, k) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-12)">` +
  inkFill("M12 2.500C16 8.500 19 12 19 15.500A7 7 0 0 1 5 15.500C5 12 8 8.500 12 2.500Z") +
  "</g>";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "face-speed": {
    means:
      "Primal Rage: a furious face with speed lines streaming behind it: faster attacks and steps, and you take more.",
    draw: () =>
      `<circle cx="15" cy="12" r="7.500" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M11 9.500L14.500 11.500M19 9.500L15.500 11.500", 2.2) +
      inkLine("M11.500 16L13 14.500L15 16L17 14.500L18.500 16", 1.6) +
      inkLine("M1.500 8H5M1.500 12H4.500M1.500 16H5", 2),
  },
  "hammer-crack-drop": {
    means:
      "Pulverizing Smash: a hammer over a cracked ground line with a drop beneath: the downed foe is weakened and wounded.",
    draw: () =>
      hammer() +
      inkLine("M2.500 17.500H8L10 15L12.500 20L15 16L17 17.500H21.500", 2.2) +
      drop(12, 22, 0.28),
  },
  "hammer-loop": {
    means:
      "Renewing Smash: a hammer over a ground line with a turning arrow beneath: the blow on the downed renews energy and recharge.",
    draw: () =>
      hammer() +
      inkLine("M3.500 18.500A5.500 4 0 1 1 9.500 21.500", 2) +
      inkLine("M3.500 15V18.500H7", 2) +
      inkLine("M14 20H21.500", 2.2),
  },
  "hammer-pips": {
    means:
      "Mokele Smash: a hammer with two adrenaline bars beside it: the blow hits harder and fills the strikes.",
    draw: () =>
      hammer() + inkFill("M15 21V15H17.500V21ZM19.500 21V12H22V21Z") + inkLine("M2 21H12", 2.2),
  },
  "eye-brow": {
    means:
      "Oppressive Gaze: an eye under a heavy slanted brow with rays falling from it: shadow on the foe and the foes beside it.",
    draw: () =>
      inkLine("M2 6L22 10", 3) +
      `<path d="M3 14C6 10.500 9 10 12 10S18 10.500 21 14C18 18 15 19 12 19S6 18 3 14Z" ${stroke(C.ink, 2)}/>` +
      `<circle cx="12" cy="14.500" r="2.600" fill="${C.ink}"/>` +
      inkLine("M7 22L8 20.500M12 22V21M17 22L16 20.500", 1.6),
  },
  "ring-drops": {
    means:
      "Envenom Enchantments: a cracked ring with three drops beneath: an enchantment stripped, poison for each that stays.",
    draw: () =>
      inkLine("M16.500 3.800A6.500 6.500 0 1 0 18 8", 2.4) +
      inkLine("M18 3.500L16.500 8", 2) +
      drop(5.5, 19, 0.5) +
      drop(12, 19, 0.5) +
      drop(18.5, 19, 0.5),
  },
};

export default glyphs;
