// Glyphs (#2205): the Warrior skills of #2180. Each a drawing of its own
// effect: a broken blade, a blow that topples its owner, a severed head, a
// stance with doubled gauge bars, a raised shield.

import { C, stroke } from "../icon-kit.mjs";
import { glyph, inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "sword-snapped": {
    means:
      "Disarm: a sword snapped in two, hilt in hand and the tip falling away: the attack is cut short.",
    draw: () =>
      inkLine("M4 20L11 13", 2.6) +
      inkLine("M5.5 14.5L10 19", 2.4) +
      inkLine("M14 10L20 4", 2.6) +
      inkLine("M11.5 7.5L9.5 10.5L12 11.5L10.5 14.5", 1.4),
  },
  "blow-toppled": {
    means:
      "Desperation Blow: a heavy blow star and, beneath it, a body tipped over on the ground bar: the swing costs you your feet.",
    draw: () =>
      `<g transform="translate(5,-2) scale(0.8)">${glyph("blow")}</g>` +
      inkLine("M2 21.5H22", 2) +
      `<circle cx="6" cy="17" r="2.2" fill="${C.ink}"/>` +
      inkLine("M8.5 18.5L15 18.5", 2.6),
  },
  "axe-head-off": {
    means:
      "Decapitate: an axe swung through, a head ring cut loose above the stroke: a certain crit that ends the foe.",
    draw: () =>
      inkLine("M12 20L21 11", 2.4) +
      inkFill("M17 6.5C21 7 22.5 10 21.5 12.5C19 12.5 16 11 15.5 9.5Z") +
      `<circle cx="7" cy="6.5" r="3.4" ${stroke(C.ink, 2)}/>` +
      inkLine("M3 14.5L12 11.5", 2),
  },
  "rage-gauge": {
    means:
      "Battle Rage: a forward chevron beside two rising gauge bars: faster, and adrenaline doubled.",
    draw: () =>
      inkLine("M3 5L10 12L3 19", 2.8) +
      inkFill("M13 21V12H16.5V21Z") +
      inkFill("M18.5 21V4H22V21Z"),
  },
  "shield-raised": {
    means:
      "Shields Up!: a shield with a chevron lifting inside it, a bar across the top where arrows stop: held high against projectiles.",
    draw: () =>
      `<path d="M12 3.5L20 6.5V13C20 17 16.5 19.5 12 21.5C7.5 19.5 4 17 4 13V6.5Z" ${stroke(C.ink, 2.6)}/>` +
      inkLine("M8.5 14.5L12 10.5L15.5 14.5", 2.6),
  },
};

export default glyphs;
