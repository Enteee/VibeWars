// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, perEach, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, nextSkill } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "banner-cross": {
    means:
      "A pennant on a pole: a shout that rallies (#934). The pennant hollow, a cross in it: a rally that heals (#934).",
    draw: () =>
      inkLine("M6 3V21", 2.4) +
      `<path d="M6 4H19.5L15.5 8.75L19.5 13.5H6Z" ${stroke(C.ink, 1.6)}/>` +
      inkFill("M10.5 6.2h2v1.8h1.8v2h-1.8v1.8h-2v-1.8H8.7v-2h1.8z"),
  },
  "note-hold": {
    means: "A note held under a fermata: a chant that is made to last (#1482).",
    draw: () =>
      `<circle cx="9" cy="17.5" r="3.4" fill="${C.ink}"/>` +
      inkLine("M12.4 17.5V9.5", 2.2) +
      inkLine("M3 9.5a9 7 0 0 1 18 0", 2.2) +
      `<circle cx="12" cy="6.5" r="1.4" fill="${C.ink}"/>`,
  },
  "banner-note": {
    means: "A banner with a note on its cloth: a song carried to every ally (#1012).",
    draw: () =>
      inkLine("M6 3V21", 2.4) +
      `<path d="M6 4H19.5L15.5 8.75L19.5 13.5H6Z" ${stroke(C.ink, 1.6)}/>` +
      `<ellipse cx="10.3" cy="10.6" rx="1.7" ry="1.3" fill="${C.ink}"/>` +
      inkLine("M11.9 10.6V6.6L14.4 7.6", 1.4),
  },
  banner: {
    means: "banner",
    draw: () => inkLine("M6 3V21", 2.4) + inkFill("M6 4H19.5L15.5 8.75L19.5 13.5H6Z"),
  },
  "anthem-shield": {
    means: "A hollow shield round a note: a chant that blocks (#959).",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2)}/>` +
      `<ellipse cx="10.5" cy="15.2" rx="2.2" ry="1.7" fill="${C.ink}"/>` +
      inkLine("M12.5 14.8V7.5L16 9.5", 1.8),
  },
  "shout-fall": {
    means: '"Coward!": the shout\'s arcs and chevrons, a body down on the ground under them.',
    draw: () =>
      inkLine("M3.5 5.5C6 7 6 10 3.5 11.5", 1.8) +
      inkLine("M9 3.5L14 8.5L9 13.5M14.5 3.5L19.5 8.5L14.5 13.5", 2.4) +
      `<circle cx="5.5" cy="19" r="2.6" fill="${C.ink}"/>` +
      inkLine("M10 19H22M14 19L12 15.5M18 19L20 15.5", 2.4),
  },
  horn: {
    means: "Cacophony (#1913): a horn, and the sound that hurts its maker.",
    draw: () =>
      inkFill("M3 9H8L16 4V20L8 15H3Z") +
      inkLine("M19 8.5Q21.5 12 19 15.5", 1.8) +
      inkLine("M21.5 5.5Q25 12 21.5 18.5", 1.4),
  },
  "next-adrenaline": {
    means:
      '"With their next skill" chants (#1497): the corner mark is what the ally casts next, the picture is the payoff.',
    draw: () => inkLine("M5 20V14M12 20V9M19 20V4", 2.6),
  },
  "next-attack-energy": {
    means: "next attack energy",
    draw: () => nextSkill("attack", "energy"),
  },
  "next-spell-energy": {
    means: "next spell energy",
    draw: () => nextSkill("spell", "energy"),
  },
  "next-signet-energy": {
    means: "next signet energy",
    draw: () => nextSkill("signet", "energy"),
  },
  "next-spell-heart-plus": {
    means: "next spell heart plus",
    draw: () => nextSkill("spell", "heart-plus"),
  },
  "next-chant-heart-plus": {
    means: "next chant heart plus",
    draw: () => nextSkill("chant", "heart-plus"),
  },
  "next-signet-cleanse": {
    means: "next signet cleanse",
    draw: () => nextSkill("signet", "cleanse"),
  },
  "next-any-cleanse": {
    means: "next any cleanse",
    draw: () => nextSkill("any", "cleanse"),
  },
  "next-spell-hex-cut": {
    means: "next spell hex cut",
    draw: () => nextSkill("spell", "hex-cut"),
  },
  "next-attack-drop-weak": {
    means: "next attack drop weak",
    draw: () => nextSkill("attack", "drop-weak"),
  },
  "next-attack-limp": {
    means: "next attack limp",
    draw: () => nextSkill("attack", "limp"),
  },
  "next-attack-interrupt": {
    means: "next attack interrupt",
    draw: () => nextSkill("attack", "interrupt"),
  },
  "next-any-uninterruptible": {
    means: "next any uninterruptible",
    draw: () => nextSkill("any", "interrupt-struck"),
  },
  "next-attack-unblockable": {
    means: "next attack unblockable",
    draw: () => nextSkill("attack", "armor-crack"),
  },
  "next-chant-cheaper": {
    means: "next chant cheaper",
    draw: () => nextSkill("chant", "energy-cut"),
  },
  "next-attack-vs-healthy": {
    means: "next attack vs healthy",
    draw: () => nextSkill("attack", "health-above"),
  },
  "shout-rush": {
    means: "Sound arcs behind two chevrons: a shout that hurries the party.",
    draw: () =>
      inkLine("M3.5 8.5C6 10.5 6 13.5 3.5 15.5", 1.8) +
      inkLine("M9 5L15.5 12L9 19M15 5L21.5 12L15 19", 2.4),
  },
  "shout-rush-adrenal": {
    means:
      "The same arcs, one chevron and three rising bars: it hurries you and gives adrenaline back.",
    draw: () =>
      inkLine("M3.5 8.5C6 10.5 6 13.5 3.5 15.5", 1.8) +
      inkLine("M8.5 5L14 12L8.5 19", 2.4) +
      inkLine("M16.5 19V15M19 19V11M21.5 19V7", 2.2),
  },
  "horn-ring": {
    means: "A single horn over a ring and rays: the kirin's holy ground (#1748).",
    draw: () =>
      `<ellipse cx="12" cy="18" rx="9" ry="3.6" ${stroke(C.ink, 2.4)}/>` +
      inkFill("M12 2.5L15 12.5H9Z") +
      inkLine("M5 6L7.5 10M19 6L16.5 10", 2.2),
  },
  "each-desecrate": {
    means: '"N for each X" (#1850): the counted thing and its gift on top, three pips under.',
    draw: () => perEach("desecrate", C.ink, 1.8),
  },
  "each-defile": {
    means: "each defile",
    draw: () => perEach("defile", C.ink, 1.8),
  },
  "each-victory": {
    means: "each victory",
    draw: () => perEach("victory", C.ink, 1.8),
  },
  "each-sadist": {
    means: "each sadist",
    draw: () => perEach("sadist", C.ink, 1.8),
  },
  "each-channeling": {
    means: "each channeling",
    draw: () => perEach("channeling", C.ink, 1.8),
  },
  "each-zeal": {
    means: "each zeal",
    draw: () => perEach("zeal", C.ink, 1.8),
  },
  "each-vigor": {
    means: "each vigor",
    draw: () => perEach("vigor", C.ink, 1.8),
  },
  "next-attack-adrenaline": {
    means: "next attack adrenaline",
    draw: () => nextSkill("attack", "next-adrenaline"),
  },
};

export default glyphs;
