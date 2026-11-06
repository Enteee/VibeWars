// Glyphs (#2487): the stand-ins of #2477, #2478 and #2479.

import { C, stroke } from "../icon-kit.mjs";
import { brokenPost, inkFill, inkLine, ringDot, smallSkull, spiritPost } from "../glyph-kit.mjs";

/** A line in the panel colour, cut out of an ink shape. @param {string} d @param {number} w */
const cut = (d, w) => `<path d="${d}" ${stroke(C.bg, w)}/>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "spirit-heal-ring": {
    means:
      "Preservation: the spirit post beside a ringed plus: its pulse heals the one ally it picks.",
    draw: () =>
      spiritPost() +
      `<circle cx="17" cy="9" r="5.500" ${stroke(C.ink, 2)}/>` +
      inkLine("M17 6.200V11.800M14.200 9H19.800", 2),
  },
  "spirit-heal-crack": {
    means:
      "Rejuvenation: a cracked spirit post beside a plus: each heal is paid for out of the spirit.",
    draw: () => brokenPost(7) + inkLine("M17 5V13M13 9H21", 2.6),
  },
  "spirit-drop-fast": {
    means: "Recovery: the spirit post beside a drop with speed lines: conditions run out faster.",
    draw: () =>
      spiritPost() +
      inkFill(
        "M17 3C19.500 7 21.500 9 21.500 12A4.500 4.500 0 0 1 12.500 12C12.500 9 14.500 7 17 3Z",
      ) +
      inkLine("M12 17H20M14 20.500H22", 2),
  },
  "spirit-rise": {
    means:
      "Restoration: a cracked spirit post beside a rising arrow: when it dies, the party is raised.",
    draw: () => brokenPost(7) + inkLine("M17 21V6M12.500 10.500L17 6L21.500 10.500", 2.4),
  },
  "spirit-item-up": {
    means:
      "Empowerment: the spirit post beside a held bundle with chevrons over it: more Health and Energy while you hold it.",
    draw: () =>
      spiritPost() +
      inkFill("M12.500 15H21.500V21H12.500Z") +
      inkLine("M13 10L17 6.500L21 10M13 5.500L17 2L21 5.500", 1.8),
  },
  "spirit-twist": {
    means:
      "Soul Twisting: the spirit post beside a turning arrow: rituals cost less and cast faster.",
    draw: () =>
      spiritPost() +
      inkLine("M21.500 5.500A5.500 5.500 0 1 0 22 11.500", 2.2) +
      inkLine("M22 2.500V6H18.500", 2),
  },
  "ring-skull": {
    means: "Death Pact Signet: a signet ring beside a skull: your life for a friend's.",
    draw: () => ringDot(8, 8, 5.5) + smallSkull(16, 16, 0.65) + inkLine("M2 21H8", 2.2),
  },
  "cloak-no-ring": {
    means: "Shadow Shroud: a hooded cloak with a ring struck out on it: no enchantment will take.",
    draw: () =>
      inkFill("M12 2C6 2 4.500 10 3 21.500H21C19.500 10 18 2 12 2Z") +
      cut("M12 7A4.500 4.500 0 1 1 11.900 7", 1.8) +
      cut("M7 17L17 7", 1.8),
  },
  "wing-feathers": {
    means: "Lyssa's Haste: a wing of two feathers: quicker on the feet, and off-beat for the foe.",
    draw: () =>
      inkFill("M2.500 21C2.500 14 6 8 14 4.500C14 12 10 18 2.500 21Z") +
      inkFill("M9.500 21C9.500 14 13 8 21.500 4C21.500 12 17 18 9.500 21Z"),
  },
  "banner-rise": {
    means:
      "We Shall Return!: a pennant on a pole with a chevron rising in it: the fallen come back stronger.",
    draw: () =>
      inkLine("M5 22V2.500", 2.4) +
      inkFill("M5 3.500H21L16.500 8.500L21 13.500H5Z") +
      cut("M9.500 11.500L13 8L16.500 11.500", 1.8),
  },
};

export default glyphs;
