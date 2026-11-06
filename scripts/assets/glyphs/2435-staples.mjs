// Glyphs (#2435): the stand-ins of #2367, #2428 and #2432.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** A line in the panel colour, cut out of an ink shape. @param {string} d @param {number} w */
const cut = (d, w) => `<path d="${d}" ${stroke(C.bg, w)}/>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "yoke-weights": {
    means:
      "Shared Burden: a yoke with a heavy weight hung at each end: the load carried by more than one.",
    draw: () =>
      inkLine("M12 2V6M3 6H21M6 6V10M18 6V10", 2.2) +
      inkFill("M2.500 10H9.500L10.500 21H1.500ZM14.500 10H21.500L22.500 21H13.500Z"),
  },
  "signet-wobble": {
    means:
      "Signet of Clumsiness: a signet ring with a stumbling zigzag inside: the target's attack goes wrong.",
    draw: () =>
      `<circle cx="12" cy="12" r="9.500" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M6.500 15L10 8.500L13.500 15.500L17.500 9", 2.4),
  },
  "ribbon-plus": {
    means: "Healing Ribbon: a bow with long tails and a plus above: healing tied to an ally.",
    draw: () =>
      inkLine(
        "M12 13C8 7 3 8 4 11.500C5 15 10 14 12 13C14 14 19 15 20 11.500C21 8 16 7 12 13Z",
        2.2,
      ) +
      inkLine("M12 13L8 21.500M12 13L16 21.500", 2.2) +
      inkLine("M12 1.500V6.500M9.500 4H14.500", 2.2),
  },
  "sword-laurel": {
    means:
      "Strength of Honor: an upright sword inside a laurel: melee blows made a little harder by honour.",
    draw: () =>
      inkFill("M12 2L14.500 5.500V14H9.500V5.500Z") +
      inkLine("M7 14H17M12 14V20", 2.4) +
      inkLine("M4.500 6C2.500 12 5 17.500 10 21M19.500 6C21.500 12 19 17.500 14 21", 2),
  },
  "sheath-plus": {
    means:
      "Life Sheath: a scabbard with a belt strap and a plus cut in it: the next blow is sheathed and heals.",
    draw: () =>
      inkFill("M8.500 2H15.500V17L12 22L8.500 17Z") +
      inkLine("M5.500 6H18.500", 2.2) +
      cut("M12 9V15M9 12H15", 2),
  },
  "hex-uturn": {
    means:
      "Reverse Hex: a hex diamond inside a U-turn arrow: the next hit turns back on the one who cast it.",
    draw: () =>
      inkFill("M12 9L15 12L12 15L9 12Z") +
      inkLine("M20 12A8 8 0 1 1 12 4M8.500 1L12.500 4L8.500 7", 2.4),
  },
  "ring-open-plus": {
    means:
      "Release Enchantments: a broken ring with a plus inside: enchantments let go, healing taken from them.",
    draw: () =>
      inkLine("M20 8.500A9 9 0 1 0 20 15.500", 2.4) +
      inkLine("M12 7V17M7 12H17", 2.6) +
      inkLine("M21 6L23 4M21 18L23 20", 2),
  },
  "shield-ring-cut": {
    means:
      "Pensive Guardian: a shield with a dashed ring cut out of its face: it turns aside enchanted attackers.",
    draw: () =>
      inkFill("M12 2L20 5V12C20 17 16 20 12 22C8 20 4 17 4 12V5Z") +
      `<circle cx="12" cy="11" r="4.500" ${stroke(C.bg, 2)} stroke-dasharray="3 2.400"/>`,
  },
  "ground-clamps": {
    means:
      "Earthen Shackles: two arched clamps rising from a stone slab: the foe held to the ground.",
    draw: () =>
      inkFill("M1.500 17H22.500V21.500H1.500Z") +
      inkLine("M5 17V11A3.500 3.500 0 0 1 12 11V17M12 17V11A3.500 3.500 0 0 1 19 11V17", 2.4),
  },
  "prism-beams": {
    means:
      "Ether Prism: a solid prism with one beam in and three beams out: what strikes it is scattered.",
    draw: () =>
      inkFill("M12 4L19 17H5Z") +
      inkLine("M1.500 8L8 11M17 10L22.500 6M18 14H22.500M16 17.500L21.500 21", 2.2),
  },
  "puddle-slip": {
    means:
      "Slippery Ground: a glossy puddle with a drop above and motion curves: feet fly out from under the foe.",
    draw: () =>
      inkFill("M1.500 19C6 16 18 16 22.500 19C18 22.500 6 22.500 1.500 19Z") +
      cut("M6 19.500C9 18.300 12 18.300 14 19", 1.4) +
      inkFill("M12 2C12 2 7.500 8 7.500 11A4.500 4.500 0 0 0 16.500 11C16.500 8 12 2 12 2Z") +
      inkLine("M3 8C3 10 4 11.500 5 12.500M21 8C21 10 20 11.500 19 12.500", 2),
  },
  "comet-speed": {
    means: "Burning Speed: a fireball with a long flaring tail: set alight and moving faster.",
    draw: () =>
      inkFill("M22 12A5.500 5.500 0 1 1 11 12A5.500 5.500 0 0 1 22 12Z") +
      inkFill(
        "M12 7C8 8 5 5.500 1.500 4.500C4.500 8 4 10 1.500 12C4 14 4.500 16 1.500 19.500C5 18.500 8 16 12 17Z",
      ),
  },
  "flask-plus": {
    means:
      "Assassin's Remedy: a corked flask half full with a plus cut in it: each attack skill cures a condition.",
    draw: () =>
      inkFill(
        "M9.500 2H14.500V8L19.500 18.500A2 2 0 0 1 17.500 21.500H6.500A2 2 0 0 1 4.500 18.500L9.500 8Z",
      ) + cut("M12 13V19M9 16H15", 2),
  },
  "daggers-rising": {
    means:
      "Blades of Steel: three daggers of rising height: it grows with every dagger attack still recharging.",
    draw: () =>
      inkFill("M3 13L5.500 9L8 13Z") +
      inkFill("M9.500 13L12 5L14.500 13Z") +
      inkFill("M16 13L18.500 1.500L21 13Z") +
      inkLine(
        "M2.500 15H8.500M9 15H15M15.500 15H21.500M5.500 15V21.500M12 15V21.500M18.500 15V21.500",
        2,
      ),
  },
  "lotus-bolt": {
    means:
      "Way of the Lotus: an open lotus with an energy bolt cut in its centre petal: a dual hit gives Energy.",
    draw: () =>
      inkFill("M12 2C16.500 6.500 16.500 12 12 17.500C7.500 12 7.500 6.500 12 2Z") +
      inkFill(
        "M11 17.500C5 17 2 13 2 8.500C7.500 9 10.500 12.500 11 17.500ZM13 17.500C19 17 22 13 22 8.500C16.500 9 13.500 12.500 13 17.500Z",
      ) +
      inkLine("M4.500 21.500H19.500", 2.2) +
      `<path d="M13 5.500L10.500 11H13L11 15" ${stroke(C.bg, 1.6)}/>`,
  },
};

export default glyphs;
