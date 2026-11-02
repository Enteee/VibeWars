// Glyphs (#2177): the Elementalist's Conjures, ether buffs and auras.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, bladeMark, healBadge, glyph } from "../glyph-kit.mjs";

/** The energy bolt, scaled and centred on a point. @param {number} cx @param {number} cy @param {number} k */
const bolt = (cx, cy, k) =>
  `<g transform="translate(${String(cx)},${String(cy)}) scale(${String(k)}) translate(-12,-12)">${glyph("energy")}</g>`;

/** A small diamond, filled, centred on a point. @param {number} x @param {number} y */
const diamond = (x, y) =>
  inkFill(
    `M${String(x)} ${String(y - 2.2)}L${String(x + 2.2)} ${String(y)}L${String(x)} ${String(y + 2.2)}L${String(x - 2.2)} ${String(y)}Z`,
  );

/** You, inside the ring of an aura of radius `r`. @param {number} r */
const ringFigure = (r) =>
  `<circle cx="12" cy="12" r="${String(r)}" ${stroke(C.ink, 2)}/>` +
  `<circle cx="12" cy="9.8" r="2.1" fill="${C.ink}"/>` +
  inkFill("M9 16.5V13.8Q12 11.9 15 13.8V16.5Z");

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "blade-conjure-flame": {
    means: "Conjure Flame: the blade with a flame in its corner, fire on every hit (#2177).",
    draw: () =>
      bladeMark(inkFill("M8 2.5C11 6 12 8.5 10.8 11.3C10 13 6 13 5.2 11.3C4 8.5 5.5 6 8 2.5Z")),
  },
  "blade-conjure-frost": {
    means: "Conjure Frost: the blade with a snowflake in its corner, cold on every hit (#2177).",
    draw: () => bladeMark(inkLine("M8 2.5V13.5M3.2 5.25L12.8 10.75M12.8 5.25L3.2 10.75", 1.8)),
  },
  "blade-conjure-lightning": {
    means:
      "Conjure Lightning: the blade with a zigzag bolt in its corner, lightning on every hit (#2177).",
    draw: () => bladeMark(inkLine("M10.5 2.5L5.5 8.5H10.5L5.5 13.5", 2)),
  },
  "ether-fast": {
    means:
      "Ether Prodigy: the energy bolt and two rising chevrons, energy that comes fast (#2177).",
    draw: () => bolt(9, 12, 0.8) + inkLine("M15.5 9L18.5 6L21.5 9M15.5 14L18.5 11L21.5 14", 2),
  },
  "ether-per-ring": {
    means:
      "Ether Renewal: the energy bolt beside a column of small rings, Health and energy per enchantment (#2177).",
    draw: () =>
      bolt(13, 10, 0.75) +
      [5, 11, 17]
        .map((y) => `<circle cx="4" cy="${String(y)}" r="1.9" ${stroke(C.ink, 1.5)}/>`)
        .join("") +
      healBadge(),
  },
  "ether-four": {
    means:
      "Elemental Attunement: the energy bolt between four diamonds, energy back from every element (#2177).",
    draw: () =>
      bolt(12, 12, 0.62) + diamond(12, 3) + diamond(12, 21) + diamond(3.5, 12) + diamond(20.5, 12),
  },
  "ring-figure": {
    means: "Magnetic Aura: you inside a plain ring, an aura on your body (#2177).",
    draw: () => ringFigure(8.5),
  },
  "ring-figure-swirl": {
    means:
      "Swirling Aura: you inside a ring of three turning arrows, projectiles swept aside (#2177).",
    draw: () =>
      `<circle cx="12" cy="9.8" r="2.1" fill="${C.ink}"/>` +
      inkFill("M9 16.5V13.8Q12 11.9 15 13.8V16.5Z") +
      inkLine(
        "M12 3.5A8.5 8.5 0 0 1 20.5 12M19.36 16.25A8.5 8.5 0 0 1 7.75 19.36M4.64 16.25A8.5 8.5 0 0 1 7.75 4.64",
        2,
      ) +
      inkLine(
        "M18.5 9.5L20.5 12L22.5 9.5M8.92 22.34L7.75 19.36L10.92 18.88M4.59 4.16L7.75 4.64L6.59 7.62",
        1.8,
      ),
  },
  "ring-figure-surge": {
    means:
      "Magnetic Surge: you inside a ring with lines bursting off it, the aura thrown out (#2177).",
    draw: () =>
      ringFigure(7.5) +
      inkLine("M12 3V0.8M4.21 7.5L2.3 6.4M19.79 7.5L21.7 6.4M3 12H0.8M21 12H23.2", 1.8),
  },
  "ring-figure-shards": {
    means:
      "Sliver Armor: you inside a ring, stone shards flying off it at whoever strikes (#2177).",
    draw: () =>
      ringFigure(7) +
      inkFill(
        "M12 0.5L13.9 3.6H10.1ZM2.04 6.25L5.68 6.15L3.78 9.45ZM21.96 6.25L20.22 9.45L18.32 6.15ZM0.5 12L3.6 10.1V13.9ZM23.5 12L20.4 13.9V10.1Z",
      ),
  },
};

export default glyphs;
