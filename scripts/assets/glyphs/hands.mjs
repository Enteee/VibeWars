// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, burst, holyStar, RIDER, NOT, riderOn, glyph } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "hand-arrow": {
    means: "An open hand over an arrow: the next attacks cannot be blocked (#1645).",
    draw: () =>
      inkLine("M6 11V5M9.5 11V3M13 11V3M16.5 11V5M6 11c0 4 2 6 5.5 6s5-2 5-6", 2) +
      inkLine("M3 21H21M18 18.5L21 21L18 23.5", 1.8),
  },
  "hand-rend": {
    means: "An open palm under a ring struck through: the touch that tears an enchantment off.",
    draw: () =>
      inkLine("M5 21V15M8.5 21V13M12 21V13M15.5 21V15M5 21c0 1.5 3 1.5 5 1.5s5.5 0 5.5-1.5", 2) +
      `<circle cx="12" cy="7" r="4.6" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M8 11L16 3", 2.2),
  },
  grasp: {
    means: "A hand reaching down over a broken line: it grips and cripples (#1573).",
    draw: () =>
      inkLine("M5.5 3V9M9.5 2.5V9M14.5 2.5V9M18.5 3V9", 2.2) +
      inkFill("M4 8.5H20V11A8 8 0 0 1 4 11Z") +
      inkLine("M3 21L8 18.5L12 21L16 18L21 20.5", 2),
  },
  hammer: {
    means: "hammer",
    draw: () =>
      inkLine("M5 20L14 11", 2.4) +
      `<rect x="11" y="3.5" width="10" height="7" rx="1" transform="rotate(45 16 7)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>`,
  },
  blow: {
    means:
      "A fist-sized impact star behind a heavy stroke: any melee blow, the weapon unsaid (#1396).",
    draw: () =>
      inkLine("M2.5 2.5L8 8", 3) +
      inkFill("M13 3.5L14.6 8L19 7L15.8 10.5L18 14.5L13.6 12.8L10 16L10.6 11.4L6 9.5L10.4 8.4Z"),
  },
  "hammer-slam": {
    means: "A hammer slamming a ground line, bars thrown off either side: the knockdown (#1217).",
    draw: () =>
      inkLine("M7 4.5L12 11", 2.4) +
      `<rect x="9.5" y="9" width="9" height="6" rx="1" transform="rotate(35 14 12)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      inkLine("M3 19.5H21M5 15.5L3.5 13.5M21 15.5L22 13.5", 2.2),
  },
  "hammer-prone": {
    means: "A hammer over a foe lying flat: it hits the downed hardest (#1383).",
    draw: () =>
      inkLine("M6 3.5L11 9.5", 2.4) +
      `<rect x="8.5" y="7.5" width="9" height="6" rx="1" transform="rotate(35 13 10.5)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      `<circle cx="5.5" cy="18" r="2.4" fill="${C.ink}"/>` +
      inkLine("M9 18H20.5", 3),
  },
  "hammer-shield": {
    means: "A hammer slam with a shield beside the impact: it knocks down what blocks it (#1383).",
    draw: () =>
      inkLine("M7 4.5L12 11", 2.4) +
      `<rect x="9.5" y="9" width="9" height="6" rx="1" transform="rotate(35 14 12)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      inkLine("M3 21H21", 2.2) +
      `<path d="M16 12.5L21.5 14.5V17.5C21.5 19 19 20 16 21C13 20 10.5 19 10.5 17.5V14.5Z" ${stroke(C.ink, 1.8)}/>`,
  },
  "hammer-counter": {
    means: "A hammer slam with a turning arrow over it: it answers an attacker (#1383).",
    draw: () =>
      inkLine("M7 4.5L12 11", 2.4) +
      `<rect x="9.5" y="9" width="9" height="6" rx="1" transform="rotate(35 14 12)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      inkLine("M3 19.5H21", 2.2) +
      inkLine("M14.5 6.5C18.5 3 21.5 6 20.5 10.5M18 9L20.5 11L22.5 8", 2),
  },
  "hammer-chevrons": {
    means:
      "A hammer slam with two weak chevrons on the ground: it hits what is weakened (#1383). A raised hammer over two weak chevrons, no slam: it weakens what it hits (#1383).",
    draw: () =>
      inkLine("M3.5 12.5L9.5 6.5", 2.4) +
      `<rect x="8" y="1.5" width="9" height="6" rx="1" transform="rotate(45 12.5 4.5)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      inkLine("M11 12.5L16 16.5L21 12.5M11 17.5L16 21.5L21 17.5", 2.2),
  },
  "hammer-weak": {
    means: "hammer weak",
    draw: () =>
      inkLine("M7 4.5L12 11", 2.4) +
      `<rect x="9.5" y="9" width="9" height="6" rx="1" transform="rotate(35 14 12)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      inkLine("M3 21H21", 2.2) +
      inkLine("M12.5 15.5L16 19L19.5 15.5", 2.6),
  },
  "hammer-quake": {
    means:
      "A hammer slam splitting the ground wide, cracks both ways: it shakes everything near (#1383).",
    draw: () =>
      inkLine("M7 4.5L12 11", 2.4) +
      `<rect x="9.5" y="9" width="9" height="6" rx="1" transform="rotate(35 14 12)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      inkLine("M2 19L6 21.5L9.5 18.5L13 21.5L16.5 18.5L19.5 21L22 19", 2.6),
  },
  "hands-plus": {
    means: "Healer's Covenant: two hands clasped over a small plus.",
    draw: () =>
      inkLine("M2 20L8 12H13", 3.6) +
      inkLine("M22 20L16 12H11", 3.6) +
      `<circle cx="12" cy="12" r="2.6" fill="${C.ink}"/>` +
      inkLine("M12 2.5V8.5M9 5.5H15", 2),
  },
  "hand-skull": {
    means: "Touch skills (#1643, #1666): a hand held low and what the touch does.",
    draw: () =>
      `<g transform="translate(0,9) scale(0.66)">${glyph("palm")}</g>` +
      `<g transform="translate(16,8) scale(0.72) translate(-11,-11)">${glyph("mark-skull")}</g>`,
  },
  "hand-drop-bolt": {
    means: "hand drop bolt",
    draw: () =>
      `<g transform="translate(0,9) scale(0.66)">${glyph("palm")}</g>` +
      `<path d="M8.5 2C8.5 2 4.8 6.2 4.8 8.2A3.7 3.7 0 0 0 12.2 8.2C12.2 6.2 8.5 2 8.5 2Z" ${stroke(C.ink, 1.6)}/>` +
      inkFill("M20.5 1.5L14 10H18.5L15.5 17.5L23 8.5H18.8Z"),
  },
  "hand-ring-rend": {
    means: "hand ring rend",
    draw: () =>
      `<g transform="translate(0,9) scale(0.66)">${glyph("palm")}</g>` +
      `<g transform="translate(16,8) scale(0.55) translate(-12,-12)">${glyph("ring-rend")}</g>`,
  },
  "hand-drop-weak": {
    means: "Target Health loss (#1648, #1680): a low hand, a drop lost and a weakening chevron.",
    draw: () =>
      `<g transform="translate(0,9) scale(0.66)">${glyph("palm")}</g>` +
      `<path d="M8.5 2C8.5 2 4.8 6.2 4.8 8.2A3.7 3.7 0 0 0 12.2 8.2C12.2 6.2 8.5 2 8.5 2Z" fill="${C.ink}"/>` +
      inkLine("M14 5.5L18.5 10L23 5.5M14 11.5L18.5 16L23 11.5", 2.2),
  },
  "hammer-drop": {
    means: "hammer drop",
    draw: () => riderOn(glyph("hammer"), RIDER.drop),
  },
  "hammer-daze": {
    means: "hammer daze",
    draw: () => riderOn(glyph("hammer"), RIDER.daze),
  },
  "hammer-blind": {
    means: "hammer blind",
    draw: () => riderOn(glyph("hammer"), RIDER.blind),
  },
  "hammer-unbound": {
    means: "hammer unbound",
    draw: () => riderOn(glyph("hammer"), RIDER.ring),
  },
  "hammer-run": {
    means: "hammer run",
    draw: () => riderOn(glyph("hammer"), RIDER.run),
  },
  "blow-unbound": {
    means: "blow unbound",
    draw: () => riderOn(glyph("blow"), RIDER.ring),
  },
  "blow-crack": {
    means: "blow crack",
    draw: () => riderOn(glyph("blow"), RIDER.crack),
  },
  "hand-star": {
    means: "An open hand and a holy star.",
    draw: () =>
      `<g transform="translate(0,9) scale(0.66)">${glyph("palm")}</g>` + holyStar(17, 7, 6),
  },
  "hand-bare": {
    means:
      'The "not" condition (#1670, #1715): the skill\'s own picture, and what the foe lacks, struck through.',
    draw: () => riderOn(glyph("palm"), NOT.ring),
  },
  "fist-fade": {
    means:
      "Signet of Ghostly Might (#1874): a fist, and the dashed edge it swells to before it fades.",
    draw: () =>
      `<rect x="2.5" y="2.5" width="19" height="19" rx="4" ${stroke(C.ink, 1.6)} stroke-dasharray="3 2.6"/>` +
      inkFill("M7 11.5H17V16.5Q17 18 15.5 18H8.5Q7 18 7 16.5Z") +
      [8.5, 11, 13.5, 16]
        .map((x) => `<circle cx="${String(x)}" cy="10.8" r="1.5" fill="${C.ink}"/>`)
        .join(""),
  },
  palm: {
    means: "An open palm, fingers up: the strike that knocks down (#1262).",
    draw: () =>
      inkLine("M5 3.5V10M8.2 2.5V10M11.4 2.5V10M14.6 3.5V10", 2.4) +
      inkFill("M3.5 10H16V15C16 18 14 20.5 11 20.5H8.5C5.5 20.5 3.5 18 3.5 15Z"),
  },
  flail: {
    means: "Warrior staples (#1586). A flail: a short haft, a chain, a spiked ball.",
    draw: () =>
      inkLine("M4 21L11 13", 2.6) +
      inkLine("M11 13C10.5 8 14 5.5 16.5 6", 1.8) +
      `<circle cx="18.5" cy="7.5" r="3.2" fill="${C.ink}"/>` +
      inkLine(
        "M18.5 1.8V3.3M23.2 7.5H21.7M20.4 3.8L19.6 4.6M16.6 3.8L17.4 4.6M20.4 11.2L19.6 10.4",
        1.4,
      ),
  },
  "blow-plus": {
    means: "A blow arriving, a plus leaving: health taken from an ally's strike (#1748).",
    draw: () =>
      inkLine("M3.5 20.5L12 12M7.5 11.5L12 12L12.5 16.5", 2.4) +
      inkLine("M17.5 3.5V10.5M14 7H21", 2.8),
  },
  "hammer-bolt": {
    means: "A hammer with a bolt across its head: a crushing bolt.",
    draw: () =>
      inkLine("M12 10V22", 2.8) +
      inkFill("M3 3H21V10H3Z") +
      `<path d="M13 3.5L8.5 7H13L9.5 9.5" ${stroke(C.bg, 1.6)}/>`,
  },
  "hand-bolt": {
    means: "Lightning Touch: a hand held low, a bolt striking from it (#1605).",
    draw: () =>
      `<g transform="translate(0,9) scale(0.66)">${glyph("palm")}</g>` +
      inkLine("M19 1.5L13.5 10.5H19.5L14 19.5", 2.6),
  },
  "hand-plus-double": {
    means:
      "A hand held low with a big plus and a small one: the touch heals, and Divine Favor doubles (#1754, #1784).",
    draw: () =>
      `<g transform="translate(0,9) scale(0.66)">${glyph("palm")}</g>` +
      inkLine("M15 2.5V11.5M10.5 7H19.5", 2.4) +
      inkLine("M21 13V18M18.5 15.5H23.5", 1.6),
  },
  "hand-limp": {
    means: "Mantis Touch: a hand held low, a broken line beside it that cripples (#1617).",
    draw: () =>
      `<g transform="translate(0,9) scale(0.66)">${glyph("palm")}</g>` +
      inkLine("M19 2L14.5 8.5L18.5 12L14 19", 2.6),
  },
  "hand-burst": {
    means: "Palm Strike: a hand held low, a burst at its fingertips (#1617).",
    draw: () =>
      `<g transform="translate(0,9) scale(0.66)">${glyph("palm")}</g>` +
      `<g transform="translate(16.5,7.5) scale(0.85) translate(-12,-12)">${inkFill(burst(7))}</g>`,
  },
};

export default glyphs;
