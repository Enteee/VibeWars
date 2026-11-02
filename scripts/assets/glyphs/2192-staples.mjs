// Glyphs (#2192): the Ranger staples of #2133 and the Elementalist staples of #2166.

import { C, stroke } from "../icon-kit.mjs";
import { glyph, inkFill, inkLine, riderOn } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "arrow-into-burst": {
    means:
      "An arrow driving into a broken-spell burst: your critical arrows interrupt (Disrupting Accuracy).",
    draw: () =>
      inkLine("M2.5 21.5L10.5 13.5", 2.2) +
      `<g transform="translate(15,9) scale(0.8) translate(-12,-12)">${glyph("interrupt")}</g>`,
  },
  "arrow-skill-bar": {
    means:
      "An arrow over a row of four skill squares: hit and they recharge, miss and they lock (Oath Shot).",
    draw: () =>
      inkLine("M3 12L14 4", 2.2) +
      inkFill("M21.5 2L12 3.5L17 10.5Z") +
      [2, 7.5, 13, 18.5]
        .map(
          (x) =>
            `<rect x="${String(x)}" y="16" width="3.5" height="5" rx="0.8" ${stroke(C.ink, 1.6)}/>`,
        )
        .join(""),
  },
  "bullseye-bolt": {
    means: "A target and an Energy bolt: Energy won on a hit, lost on a miss (Marksman's Wager).",
    draw: () =>
      `<circle cx="9.5" cy="14.5" r="7" ${stroke(C.ink, 2)}/>` +
      `<circle cx="9.5" cy="14.5" r="2.2" fill="${C.ink}"/>` +
      `<g transform="translate(18,7) scale(0.62) translate(-12,-12)">${glyph("energy")}</g>`,
  },
  "chevrons-bolt": {
    means:
      "Chevrons running at a bolt: a stance that hurries you and feeds on the storm (Storm Chaser).",
    draw: () =>
      inkLine("M2.5 6L8 12L2.5 18M7.5 6L13 12L7.5 18", 2.4) +
      inkLine("M19 2.5L13.5 12.5H20L14.5 21.5", 2.6),
  },
  "arrow-shout-drop": {
    means:
      "An arrow with sound arcs at its tip and a drop: the foe within earshot bleeds (Screaming Shot).",
    draw: () =>
      inkLine("M2.5 21.5L11 13", 2.2) +
      inkFill("M17 7L8.5 9.5L14.5 15.5Z") +
      inkLine("M19 3.5C21.5 6 21.5 9.5 19 12", 1.8) +
      inkFill("M19 14.5c1.5 2 2.5 3 2.5 4.3a2.5 2.5 0 0 1-5 0c0-1.3 1-2.3 2.5-4.3z"),
  },
  "eye-bolt": {
    means: "An eye with a bolt through it: struck blind by lightning (Blinding Surge).",
    draw: () =>
      `<path d="M1.5 12C5 6 8 5 12 5S19 6 22.5 12C19 18 16 19 12 19S5 18 1.5 12Z" ${stroke(C.ink, 2)}/>` +
      inkFill("M14 1.5L6.5 13H11.5L9.5 22.5L17.5 10.5H12.5Z"),
  },
  "shield-shocked": {
    means:
      "A shield with a bolt through it and sparks beside: lightning that cracks armor (Shell Shock).",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2)}/>` +
      inkFill("M14 4.5L8 13H12L10.5 19.5L16 11H12Z") +
      inkLine("M1 9.5H3M23 9.5H21M1 15H2.5M23 15H21.5", 1.8),
  },
  "cage-cracked": {
    means:
      "A cage of ice with a cracked shield riding on it: the foe crawls, and rots if its armor is cracked (Teinai's Prison).",
    draw: () => riderOn(glyph("ice-cage"), glyph("armor-crack")),
  },
  "shard-energy": {
    means:
      "An ice shard with an Energy bolt riding on it: cold that gives Energy back (Glowing Ice).",
    draw: () => riderOn(glyph("shard"), glyph("energy")),
  },
  "shard-halved": {
    means:
      "An ice shard with a half-filled ring riding on it: cold that is halved against the enchanted (Vapor Blade).",
    draw: () =>
      riderOn(
        glyph("shard"),
        `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 3)}/>` + inkFill("M6 12H18A6 6 0 0 1 6 12Z"),
      ),
  },
};

export default glyphs;
