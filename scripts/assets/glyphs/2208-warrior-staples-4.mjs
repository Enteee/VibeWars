// Glyphs (#2208): the Warrior staples of #2181. Stances are creatures' marks
// (claws, a furious face, a bull's horns); attacks draw what they do to the foe.

import { C, stroke } from "../icon-kit.mjs";
import { DROP, inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "claws-three": {
    means:
      "Tiger Stance: three curved claw rakes side by side: you strike faster, until a blow misses.",
    draw: () => inkLine("M3 5Q9 11 6 21M10 3Q16 10 13 21M17 5Q22 11 20 20", 2.6),
  },
  "face-furious": {
    means:
      "Berserker Stance: a furious face, slanted brows over a gritted mouth, rage ticks above: faster, and double adrenaline, until a skill is used.",
    draw: () =>
      `<circle cx="12" cy="14" r="8" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M7 10.5L11 12.5M17 10.5L13 12.5", 2.4) +
      inkLine("M8.5 18L10 16.5L12 18L14 16.5L15.5 18", 1.6) +
      inkLine("M12 1.5V3.5M5.5 3.5L7 5M18.5 3.5L17 5", 1.8),
  },
  "skull-cracked": {
    means:
      "Skull Crack: a skull split by a jagged crack: the blow interrupts, and a spell is dazed.",
    draw: () =>
      `<path d="M12 3C7 3 4 6.5 4 11C4 14 5.5 15.5 7.5 16.5V20H16.5V16.5C18.5 15.5 20 14 20 11C20 6.5 17 3 12 3Z" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M13 3L10.5 8L13.5 11L11 16", 1.8) +
      inkFill("M7.5 10.5h3v3h-3zM14.5 10.5h3v3h-3z"),
  },
  "slash-leg-bleed": {
    means:
      "Crippling Slash: a slash arc across a broken leg line, a drop beside it: crippled and bleeding.",
    draw: () =>
      inkLine("M8 3L7 10L12 13L9 21", 2.2) +
      inkLine("M3 17Q13 15 21 4", 2.6) +
      `<g transform="translate(14,12) scale(0.4)">${DROP}</g>`,
  },
  "bull-horns": {
    means:
      "Bull's Charge: a bull's horns and nose ring: charging, and a moving foe is knocked down.",
    draw: () =>
      inkLine("M2.5 4C2.5 11 6 14 12 14C18 14 21.5 11 21.5 4", 2.8) +
      `<circle cx="12" cy="18.5" r="3" ${stroke(C.ink, 2.2)}/>`,
  },
  "sword-return": {
    means:
      "Counterattack: a blade and an arrow turning back on itself over it: a strike answered, Energy won.",
    draw: () =>
      inkLine("M4.5 19.5L15 9", 2.6) +
      inkLine("M5 13L11 19", 2.4) +
      inkLine("M21 14C21 6 16 3 9 4", 2.2) +
      inkLine("M12.5 1.5L9 4L12 7", 2.2),
  },
  "knee-cut": {
    means:
      "Knee Cutter: a bent leg with a straight blade cut through the knee: it pays Energy and adrenaline against the crippled.",
    draw: () =>
      inkLine("M9 3L15 12L8 21", 2.6) + inkLine("M3 13L21 9", 2.6) + inkFill("M19 17h3v3h-3z"),
  },
  "sword-stance-bar": {
    means:
      "Standing Slash: a sword over a wide ground bar: it hits harder while you hold a stance.",
    draw: () =>
      inkLine("M5.5 16L19 3.5", 2.6) + inkLine("M7 9.5L12 14.5", 2.4) + inkLine("M3 21H21", 3),
  },
  "sword-shout": {
    means:
      "Soldier's Strike: a sword and an exclamation mark: it cannot be blocked while a shout or chant is on you.",
    draw: () =>
      inkLine("M12.5 20L21 11.5", 2.6) +
      inkLine("M13.5 14.5L16.5 17.5", 2.4) +
      inkLine("M5 3.5V11", 3) +
      `<circle cx="5" cy="16" r="1.8" fill="${C.ink}"/>`,
  },
};

export default glyphs;
