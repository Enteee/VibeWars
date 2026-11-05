// Glyphs (#2338): the stand-ins of #2315.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

const HEART_D = "M12 21L4.5 13.5A4.6 4.6 0 0 1 12 7.5A4.6 4.6 0 0 1 19.5 13.5Z";

/** A hammer head and handle, pointing up and to the right. */
const hammerHead = () =>
  inkLine("M4 20L11 13", 2.4) +
  `<rect x="6" y="6.500" width="12" height="7" rx="1" transform="rotate(45 12 10)" fill="${C.ink}"/>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "heart-steps": {
    means: "To the Limit!: a heart under three rising bars: health spent, adrenaline climbing.",
    draw: () =>
      inkFill("M2 11H6V7H2ZM10 11H14V4H10ZM18 11H22V1.500H18Z") +
      `<g transform="translate(12,17.500) scale(0.62) translate(-12,-14)"><path d="${HEART_D}" fill="${C.ink}"/></g>`,
  },
  "club-swing": {
    means:
      "Crude Swing: a lumpy club with a wide swing arc behind it: a wild blow hitting all around.",
    draw: () =>
      inkFill("M3 19L5 21L13.500 15.500L19 10.500L14 4.500Z") + inkLine("M2.500 10Q4 4 10 2", 2.2),
  },
  "axe-whirl": {
    means:
      "Whirling Axe: a double-bladed axe inside a turning arrow: the axe spins through the stance.",
    draw: () =>
      inkFill("M12 7C7 7 7 17 12 17C10 14 10 10 12 7ZM12 7C17 7 17 17 12 17C14 14 14 10 12 7Z") +
      inkLine("M12 2.500A9.500 9.500 0 1 1 2.500 12", 2) +
      inkLine("M2.500 7.500V12H7", 2),
  },
  "hammer-push": {
    means: "Forceful Blow: a hammer with push lines behind its strike: the stance is knocked off.",
    draw: () => hammerHead() + inkLine("M17 15H22M16 19H21M17 11H22", 2),
  },
  "hammer-halo": {
    means: "Auspicious Blow: a hammer with a halo over its head: a lucky strike.",
    draw: () =>
      hammerHead() + `<ellipse cx="17.500" cy="4" rx="4.500" ry="1.800" ${stroke(C.ink, 1.8)}/>`,
  },
  "axe-crack": {
    means: "Critical Chop: a downward blade wedge over a cracked line: the chop that splits.",
    draw: () =>
      inkLine("M12 2V8", 2.4) +
      inkFill("M4 8H20L12 16Z") +
      inkLine("M12 16L10 19L13.500 20.500L11.500 23", 1.8),
  },
};

export default glyphs;
