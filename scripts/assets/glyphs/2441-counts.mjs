// Glyphs (#2441): the stand-ins of #2373 and #2438.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** A line in the panel colour, cut out of an ink shape. @param {string} d @param {number} w */
const cut = (d, w) => `<path d="${d}" ${stroke(C.bg, w)}/>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "ring-crosshair-crack": {
    means:
      "Mark of Insecurity: a target ring with four ticks and a crack through it: the hexed foe's own protections break sooner.",
    draw: () =>
      `<circle cx="12" cy="12" r="7" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M12 1.500V5M12 19V22.500M1.500 12H5M19 12H22.500", 2.2) +
      cut("M14.500 6L10.500 12L13.500 12.500L9.500 18", 2.2),
  },
  "plate-snowflake": {
    means:
      "Frigid Armor: a breastplate with a snowflake cut out of its chest: armor against blows, and no flame takes hold.",
    draw: () =>
      inkFill("M3 5L8 3H16L21 5V10L18 12V21H6V12L3 10Z") +
      cut("M12 7V17M7.500 9.500L16.500 14.500M16.500 9.500L7.500 14.500", 1.8),
  },
  "slab-blade": {
    means:
      "Stone Sheath: a cracked stone slab with a blade-shaped slot: ally and caster armoured in rock, blows glance off.",
    draw: () =>
      inkFill("M7 2H17L21 6V22H3V6Z") +
      cut("M12 6V16M9 16H15M12 16V19", 2.2) +
      cut("M17 2.500L15 8.500", 1.5),
  },
  "gust-ring-shards": {
    means:
      "Air of Disenchantment: a gust of two curls that blows a ring to pieces: enchantments on the foes around are torn away.",
    draw: () =>
      inkLine("M2 8H11A3 3 0 1 0 8 5M2 15H14A3 3 0 1 1 11 18", 2.4) +
      inkLine("M17 4.500A5 5 0 0 1 21.500 9M21.500 13A5 5 0 0 1 20 18", 2.2) +
      inkFill("M18 11.500L20 10.500L21 12.500L19 13.500Z"),
  },
  "wheat-crescent": {
    means:
      "Farmer's Scythe: an ear of wheat cut across by a crescent blade: hit more than one foe and it comes back at once.",
    draw: () =>
      inkLine("M9 22V7", 2.2) +
      inkFill("M9 2L11.500 5.500L9 9L6.500 5.500Z") +
      inkFill("M9 8L12 11L9 14L6 11Z") +
      inkLine("M3 20C10 20 19 14 21 3", 2.8) +
      inkLine("M21 3C19 8 14 12 10 14", 1.8),
  },
  "claw-leg": {
    means:
      "Harrier's Grasp: three claw fingers closing around a leg: the hand that Cripples what it holds.",
    draw: () =>
      inkFill("M13 2H19V22H13Z") +
      inkLine("M2 4C8 4 11 4 11 8M2 12H11M2 20C8 20 11 20 11 16", 2.6) +
      cut("M16 6V18", 1.2),
  },
  "hourglass-plus": {
    means:
      "Pious Renewal: an hourglass with a plus on its sand: nothing for eight seconds, then healed and recharged.",
    draw: () =>
      inkFill(
        "M5 2H19V5C19 9 15 11 13.500 12C15 13 19 15 19 19V22H5V19C5 15 9 13 10.500 12C9 11 5 9 5 5Z",
      ) + cut("M12 15V20M9.500 17.500H14.500", 1.8),
  },
  "rune-plus-pips": {
    means:
      "Glyph of Restoration: a rune diamond with a plus and two pips below: the next two spells heal.",
    draw: () =>
      inkFill("M12 1.500L20 9L12 16.500L4 9Z") +
      cut("M12 5V13M8 9H16", 2) +
      inkFill("M7 19.500A2 2 0 1 0 7 23.500A2 2 0 1 0 7 19.500Z") +
      inkFill("M17 19.500A2 2 0 1 0 17 23.500A2 2 0 1 0 17 19.500Z"),
  },
  "arch-three-rings": {
    means:
      "Mantra of Signets: a ward arch over three signet rings: armor for every signet on the bar.",
    draw: () =>
      inkLine("M2.500 10C2.500 6 6.500 3.500 12 2C17.500 3.500 21.500 6 21.500 10", 2.4) +
      `<circle cx="5.500" cy="17" r="3.200" ${stroke(C.ink, 2.2)}/>` +
      `<circle cx="12" cy="17" r="3.200" ${stroke(C.ink, 2.2)}/>` +
      `<circle cx="18.500" cy="17" r="3.200" ${stroke(C.ink, 2.2)}/>`,
  },
};

export default glyphs;
