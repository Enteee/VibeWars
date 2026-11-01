// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import { WEAPON_MARKS } from "../weapon-marks.mjs";
import {
  inkFill,
  inkLine,
  burst,
  bladeMark,
  holyStar,
  RIDER,
  riderOn,
  glyph,
} from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "blade-plus": {
    means:
      "A blade with a mark in the empty corner above it: a weapon spell, and what it does (#984).",
    draw: () =>
      bladeMark(
        `<circle cx="8" cy="8" r="5" ${stroke(C.ink, 1.8)}/>` +
          inkLine("M8 5.5V10.5M5.5 8H10.5", 1.8),
      ),
  },
  "blade-turn": {
    means: "blade turn",
    draw: () =>
      bladeMark(inkLine("M11 6.5A3.5 3.5 0 1 0 8.5 11.5M8.5 11.5L10.5 12M8.5 11.5L9 9.5", 1.8)),
  },
  "blade-resilient": {
    means: "The Ritualist's weapon spells 3 (#1706): the blade and the rider its status repeats.",
    draw: () => bladeMark(WEAPON_MARKS.resilient(C.ink)),
  },
  "blade-ghostly": {
    means: "blade ghostly",
    draw: () => bladeMark(WEAPON_MARKS.ghostly(C.ink)),
  },
  "blade-sundering": {
    means: "blade sundering",
    draw: () => bladeMark(WEAPON_MARKS.sundering(C.ink)),
  },
  "blade-shadow": {
    means: "blade shadow",
    draw: () => bladeMark(WEAPON_MARKS.shadow(C.ink)),
  },
  "blade-warmongers": {
    means: "blade warmongers",
    draw: () => bladeMark(WEAPON_MARKS.warmongers(C.ink)),
  },
  "blade-wailing": {
    means: "blade wailing",
    draw: () => bladeMark(WEAPON_MARKS.wailing(C.ink)),
  },
  "blade-nightmare": {
    means: "blade nightmare",
    draw: () => bladeMark(WEAPON_MARKS.nightmare(C.ink)),
  },
  "blade-fury-bolt": {
    means: "blade fury bolt",
    draw: () => bladeMark(WEAPON_MARKS.fury(C.ink)),
  },
  "blade-renewal": {
    means: "blade renewal",
    draw: () => bladeMark(WEAPON_MARKS.renewal(C.ink)),
  },
  "blade-fury": {
    means:
      "A blade with rising bars ending in a spike: adrenaline gated on a chant, Soldier's Fury (#1524).",
    draw: () =>
      bladeMark(inkLine("M3.5 13V10M7 13V7", 2.2) + inkFill("M9.5 13V8L12 2.5L14.5 8V13Z")),
  },
  "blade-fast": {
    means: "blade fast",
    draw: () => bladeMark(inkLine("M3.5 5.5L6.5 8.5L3.5 11.5M7.5 5.5L10.5 8.5L7.5 11.5", 1.8)),
  },
  "blade-cleanse": {
    means: "A blade with a drop struck through above it: a weapon spell that cleanses (#1048).",
    draw: () =>
      bladeMark(
        `<path d="M8 3C8 3 4.5 7 4.5 9.2A3.5 3.5 0 0 0 11.5 9.2C11.5 7 8 3 8 3Z" ${stroke(C.ink, 1.5)}/>` +
          inkLine("M3.5 3.5L12 12", 1.6),
      ),
  },
  "blade-hook": {
    means:
      "A blade with a hook turning back above it: a weapon spell that hits back at the attacker (#1048).",
    draw: () => bladeMark(inkLine("M11.5 4.5H8a2.5 2.5 0 0 0 0 5H10.5M6.5 3L5 4.5L6.5 6", 1.8)),
  },
  "blade-shards": {
    means: "A blade with shards flying off above it: a weapon spell that splinters (#1048).",
    draw: () => bladeMark(inkFill("M3 4L6 3L5.5 6ZM8 6L11 5L10 8.5ZM4 9L7 8.5L6 11.5Z")),
  },
  "blade-limp": {
    means:
      "Swordsmanship (#1354): a blade with the payoff in the corner above it. Hamstring cripples: a broken leg.",
    draw: () => bladeMark(inkLine("M10 2.5L6 6.5L9.5 9.5L5 13.5", 2.4)),
  },
  "blade-pierce": {
    means: "Pure Strike goes through blocks: a shield struck through.",
    draw: () =>
      bladeMark(
        `<path d="M8 2.5L12.5 4.2V8C12.5 10.6 10.5 11.9 8 13C5.5 11.9 3.5 10.6 3.5 8V4.2Z" ${stroke(C.ink, 1.8)}/>` +
          inkLine("M2.5 2.5L13 13", 2.2),
      ),
  },
  "blade-drop": {
    means: "Gash deepens a bleed: a drop.",
    draw: () =>
      bladeMark(
        `<path d="M8 2.5C8 2.5 3.8 7 3.8 9.6A4.2 4.2 0 0 0 12.2 9.6C12.2 7 8 2.5 8 2.5Z" fill="${C.ink}"/>`,
      ),
  },
  "blade-half": {
    means: "Final Thrust finishes a foe below half health: a half-filled disc.",
    draw: () =>
      bladeMark(
        `<circle cx="8" cy="8" r="5" ${stroke(C.ink, 1.8)}/><path d="M8 3A5 5 0 0 0 8 13Z" fill="${C.ink}"/>`,
      ),
  },
  "blade-adrenal": {
    means: "Dragon Slash gives adrenaline back: three rising bars.",
    draw: () => bladeMark(inkLine("M3.5 13V9M8 13V6M12.5 13V3", 2.6)),
  },
  "blade-burst": {
    means: "Savage Slash interrupts: a burst.",
    draw: () =>
      bladeMark(
        `<g transform="translate(8,8) scale(0.85) translate(-12,-12)">${inkFill(burst(6))}</g>`,
      ),
  },
  hilt: {
    means: "A sword hilt with a plus on its grip: a weapon spell that mends (#1048).",
    draw: () =>
      inkLine("M5 9.5H19", 2.8) +
      inkLine("M12 9.5V20.5", 4) +
      inkFill("M12 2.5L15 6.5L12 8L9 6.5Z") +
      `<path d="M12 12.5V17.5M9.5 15H14.5" stroke="${C.bg}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
  },
  "slash-trio": {
    means: "Three fast slashes: attack faster (#1645).",
    draw: () => inkLine("M4 19L12 5M9 20L17 6M14 21L21 9", 2.6),
  },
  "slash-bars": {
    means: "Two fast slashes over a rising bar: faster attacks and adrenaline.",
    draw: () =>
      inkLine("M10 21L21 4", 3.2) +
      inkLine("M15 21L23 9", 1.6) +
      inkLine("M2 7H9M2 12H7M2 17H5", 1.8),
  },
  axe: {
    means: "axe",
    draw: () =>
      inkLine("M5 20L16 7", 2.4) + inkFill("M11 3.5C17 2.5 21.5 5 21 9C20.5 13 16.5 15 14 12.5Z"),
  },
  sword: {
    means: "sword",
    draw: () =>
      inkLine("M5.5 18.5L19 5", 2.6) + inkLine("M7 11.5L12.5 17", 2.4) + inkLine("M4 20l2-2", 2.6),
  },
  "sword-heal": {
    means:
      "A sword with a small plus in its upper left: a heal that waits on a weapon spell (#962).",
    draw: () =>
      inkLine("M7 20.5L20.5 7", 3) +
      inkLine("M8 12.5L14.5 19", 2.6) +
      inkLine("M4.5 20l2.5-2.5", 2.6) +
      inkLine("M6.5 3V9M3.5 6H9.5", 2),
  },
  sweep: {
    means: "A wide arc with a second inside it: a sweep that clears the ground in front (#1396).",
    draw: () =>
      inkLine("M3.5 19C3.5 10 9 4.5 18 4.5", 2.8) + inkLine("M8 19C8 14 11 11 15.5 10.5", 2.2),
  },
  "blade-cap-drop": {
    means: "Xinrae's Weapon: a blade, a bar capping the blow, a drop lost by the attacker.",
    draw: () =>
      bladeMark(
        inkLine("M2.5 3H12.5", 2.4) +
          `<path d="M8 5.5C8 5.5 5 8.6 5 10.4A3 3 0 0 0 11 10.4C11 8.6 8 5.5 8 5.5Z" fill="${C.ink}"/>`,
      ),
  },
  "axe-weak": {
    means:
      "Warrior staples 3 (#1658, #1672): the weapon up and left, a ringed rider bottom right for the condition it reads or gives.",
    draw: () => riderOn(glyph("axe"), RIDER.weak),
  },
  "axe-limp": {
    means: "axe limp",
    draw: () => riderOn(glyph("axe"), RIDER.limp),
  },
  "axe-burst": {
    means: "axe burst",
    draw: () => riderOn(glyph("axe"), RIDER.burst),
  },
  "axe-trio": {
    means: "axe trio",
    draw: () =>
      ["0,6", "6,3", "12,0"]
        .map((at) => `<g transform="translate(${at}) scale(0.62)">${glyph("axe")}</g>`)
        .join(""),
  },
  "sword-bleed": {
    means: "sword bleed",
    draw: () => riderOn(glyph("sword"), RIDER.drop),
  },
  "sword-heavy": {
    means: "sword heavy",
    draw: () => riderOn(glyph("sword"), RIDER.plus),
  },
  "sword-daze": {
    means: "sword daze",
    draw: () => riderOn(glyph("sword"), RIDER.daze),
  },
  "sword-adrenal": {
    means: "sword adrenal",
    draw: () => riderOn(glyph("sword"), RIDER.bars),
  },
  "blade-teeth": {
    means: "Brutal Weapon (#1916): a blade with teeth along one edge.",
    draw: () =>
      inkLine("M5 19L19 5", 2.6) +
      inkLine("M4 13.5L10.5 20", 2.4) +
      inkFill("M9 10.5L5.5 8.5L8.5 7.5Z") +
      inkFill("M13 6.5L10 4L12.5 3.5Z") +
      inkFill("M15 16L17.5 19L13.5 18.5Z"),
  },
  "sword-pips": {
    means: "Signet of Strength (#1916): a sword and the strikes it is spent on.",
    draw: () =>
      inkLine("M9 20L21 8", 2.6) +
      inkLine("M8 15.5L13 20.5", 2.4) +
      [4.5, 9, 13.5]
        .map((y) => `<circle cx="4.5" cy="${String(y)}" r="1.6" fill="${C.ink}"/>`)
        .join(""),
  },
  whirl: {
    means: "A spiral from the middle out: the whirlpool that tears a spell away (#1440).",
    draw: () => inkLine("M12 12a2 2 0 0 1 4 0a4 4 0 0 1-8 0a6 6 0 0 1 12 0a8 8 0 0 1-16 0", 2.2),
  },
  "axe-cross": {
    means: "An axe with the cross of a Deep Wound above its haft.",
    draw: () =>
      inkLine("M7 21L17 8", 2.4) +
      inkFill("M12 4.5C17.5 3.5 21.5 6 21 9.5C20.5 13 17 14.5 15 12.5Z") +
      inkLine("M3 3L8 8M8 3L3 8", 2),
  },
  "blade-limp-up": {
    means: "A blade with a limp that ends in an arrow up: it hits harder on a crippled foe.",
    draw: () =>
      bladeMark(
        inkLine("M10 13V4.5M6.5 8L10 4.5L13.5 8", 2.2) + inkLine("M3.5 13L5.5 10L7.5 12.5", 1.8),
      ),
  },
  parry: {
    means: "A shield held at the left, a blade leaving it up and right: a parry and its answer.",
    draw: () =>
      inkFill("M2.5 9L8 7L13.5 9V14.5C13.5 18.4 10.8 20 8 21.8C5.2 20 2.5 18.4 2.5 14.5Z") +
      inkLine("M14 10.5L21.5 3", 3) +
      inkLine("M13.5 5.5L18.5 10.5", 2.4),
  },
  "sword-star": {
    means: "sword star",
    draw: () =>
      `<g transform="translate(-1,2) scale(0.85)">${glyph("sword")}</g>` + holyStar(18, 6, 5),
  },
  "blade-struck": {
    means: "A blade struck through: the foe cannot attack (#1748).",
    draw: () =>
      inkLine("M6 18L16 8M14 6L18 10M8 20L4 16", 2.4) + inkLine("M4.5 4.5L19.5 19.5", 2.2),
  },
  "chop-keen": {
    means: "Staples art (#1938). A chopping axe, head up and right, shaft down and left.",
    draw: () =>
      inkLine("M8 21L17 9", 2.4) +
      inkFill("M11 4.5C16 3 21 5 20.5 8.5C19 11.5 15.5 12 14 9.5Z") +
      inkFill("M5 2.5L6.2 5.3L9 6.5L6.2 7.7L5 10.5L3.8 7.7L1 6.5L3.8 5.3Z"),
  },
  "chop-pierce": {
    means: "The axe over two plates it passes through: part of the armor is ignored.",
    draw: () =>
      inkLine("M9 21L18 9", 2.4) +
      inkFill("M12 4.5C17 3 22 5 21.5 8.5C20 11.5 16.5 12 15 9.5Z") +
      inkLine("M2 13H8M2 17H8", 2.2),
  },
  "chop-bleed": {
    means: "The same axe and a drop of blood: it cuts a knocked-down foe.",
    draw: () =>
      inkLine("M9 21L18 9", 2.4) +
      inkFill("M12 4.5C17 3 22 5 21.5 8.5C20 11.5 16.5 12 15 9.5Z") +
      inkFill("M5 11C5 11 2 14.8 2 16.6A3 3 0 0 0 8 16.6C8 14.8 5 11 5 11Z"),
  },
  "slashes-flurry": {
    means: "Three quick slashes, the middle one longest: attacks in a hurry.",
    draw: () =>
      inkLine("M3 17L9 5", 2.4) + inkLine("M9 20L17 4", 2.4) + inkLine("M16 21L21 11", 2.4),
  },
  "axe-sweep": {
    means: "An axe with a swing arc for the sweep.",
    draw: () =>
      inkLine("M8 21L16 9", 2.4) +
      inkFill("M12 3.5C17 2.5 21 5 20.5 8.5C20 12 17 13 15 11.5Z") +
      inkLine("M2.5 13C3.5 17 6 20 9 21.5", 2.2),
  },
  "axe-pierce": {
    means: "An axe through a shield for armor penetration.",
    draw: () =>
      `<g transform="translate(15,15) scale(0.7) translate(-12,-12)"><path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 3)}/></g>` +
      inkLine("M3 21L14 10", 2.4) +
      inkFill("M9 5C14 3.5 19 5 19 8.5C17.5 11 14 11.5 12.5 9Z"),
  },
  "sword-sun-moon": {
    means: "A sun and a crescent under one slash for the unblockable double strike.",
    draw: () =>
      `<circle cx="7" cy="7" r="3.6" fill="${C.ink}"/>` +
      inkFill("M19 10A7 7 0 1 0 12 20A5.4 5.4 0 0 1 19 10Z") +
      inkLine("M10 15L21 4", 2.2),
  },
};

export default glyphs;
