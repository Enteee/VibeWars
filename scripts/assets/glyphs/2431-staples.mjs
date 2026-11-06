// Glyphs (#2431): the stand-ins of #2413 and #2414.

import { C, stroke } from "../icon-kit.mjs";
import { RIDER, glyph, inkFill, inkLine, riderOn, smallFigure } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "figure-bars": {
    means:
      "Inspirational Speech: a figure beside three rising adrenaline bars: an ally's strikes filled.",
    draw: () => smallFigure(7.5, 13, 0.85) + inkLine("M13.500 21V16M17 21V11M20.500 21V5.500", 2.8),
  },
  "eye-shut-bolt": {
    means:
      "Meditation: a shut eye over an energy bolt: adrenaline given up, energy gained as enchantments end.",
    draw: () =>
      inkLine(
        "M2.500 6.500C8 12.500 16 12.500 21.500 6.500M6.500 10L5 12.500M12 11.500V14.500M17.500 10L19 12.500",
        2.2,
      ) + inkFill("M13 14L8 19.500H11.500L10.500 23L16 17.500H12.500Z"),
  },
  "scythe-bolt": {
    means:
      "Radiant Scythe: the house scythe with an energy bolt in the ring: the blow grows with energy.",
    draw: () => riderOn(glyph("scythe"), glyph("energy")),
  },
  "dagger-whet": {
    means: "Sharpen Daggers: a dagger with a drop in the ring: its blows bleed.",
    draw: () => riderOn(glyph("dagger"), RIDER.drop),
  },
  "bolt-weapon-ring": {
    means:
      "Wielder's Strike: a big lightning bolt inside a dashed ring: a weapon spell makes the strike bigger.",
    draw: () =>
      `<circle cx="12" cy="12" r="10" ${stroke(C.ink, 1.8)} stroke-dasharray="4 3.200"/>` +
      inkFill("M14 3.500L6.500 13H11.500L10 20.500L17.500 10.500H12.500Z"),
  },
  "bowl-bolt": {
    means:
      "Offering of Spirit: a bowl held up with an energy bolt above it: energy given, nothing sacrificed.",
    draw: () =>
      inkFill("M3 14H21C21 19 17 21.500 12 21.500S3 19 3 14Z") +
      inkFill("M13.500 1.500L7.500 9.500H11.500L10.500 13L16.500 6H12.500Z") +
      inkLine("M4 5L6 7M20 5L18 7", 2),
  },
  "chain-links-slow": {
    means:
      "Binding Chains: two chain links over a ground line with a chevron: movement slowed and hurt.",
    draw: () =>
      `<rect x="2.500" y="4" width="11" height="7" rx="3.500" ${stroke(C.ink, 2.2)}/>` +
      `<rect x="10.500" y="4" width="11" height="7" rx="3.500" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M9 21L12 17.500L15 21", 2.2) +
      inkLine("M3 21H6.500M17.500 21H21", 2.2),
  },
  "mask-drain": {
    means:
      "Sympathetic Visage: a mask with a falling chevron on its chin: the attacker's adrenaline and energy drain.",
    draw: () =>
      inkFill("M3.500 3.500H20.500V12C20.500 17.500 16.500 21 12 21S3.500 17.500 3.500 12Z") +
      `<path d="M6.500 8.500L10.500 10.500L6.500 11.500ZM17.500 8.500L13.500 10.500L17.500 11.500Z" fill="${C.bg}"/>` +
      inkLine("M8.500 14.500L12 18L15.500 14.500", 1.8).replace(C.ink, C.bg),
  },
  "signet-turn": {
    means:
      "Mantra of Inscriptions: a signet's seal inside a turning arrow: signets recharge faster.",
    draw: () =>
      `<rect x="8" y="8" width="8" height="8" rx="1" ${stroke(C.ink, 2)}/>` +
      inkLine("M12 2.500A9.500 9.500 0 0 1 21.500 12", 2.2) +
      inkLine("M21.500 12A9.500 9.500 0 0 1 12 21.500", 2.2) +
      inkFill("M23 6L21.500 12L17.500 8Z") +
      inkLine("M12 21.500A9.500 9.500 0 0 1 2.500 12A9.500 9.500 0 0 1 12 2.500", 2.2),
  },
  "ankh-chant": {
    means:
      "Resurrection Chant: the ankh with two chant arcs beside it: a resurrection sung, at half the range.",
    draw: () =>
      smallFigure(9, 12.5, 0.95) +
      inkLine("M17 7C19.500 10 19.500 15 17 18M21 4C25 9.500 25 15.500 21 21", 2),
  },
  "blade-bolt-gain": {
    means:
      "Defender's Zeal: a blade striking in from the corner and an energy bolt rising: each foe's hit feeds energy.",
    draw: () =>
      inkLine("M3 3L10 10", 2.4) +
      inkLine("M2.500 8L8 2.500", 2) +
      inkFill("M17 6L10.500 15H15.500L14 22L21 12.500H16Z"),
  },
  funnel: {
    means:
      "Whirlwind: a funnel of stacked arcs narrowing to the ground: attackers are knocked down.",
    draw: () =>
      inkLine(
        "M3 4C9 6 15 6 21 4M5 9.500C10 11.500 14 11.500 19 9.500M8 15C11 16.500 13 16.500 16 15M10.500 20.500H13.500",
        2.4,
      ),
  },
  "flame-speed": {
    means:
      "Flame Djinn's Haste: a flame with speed lines streaming behind it: a burst, then a faster run.",
    draw: () =>
      `<g transform="translate(5,0) scale(0.85)">${glyph("flame")}</g>` +
      inkLine("M1.500 9H6M1.500 13.500H5M1.500 18H6", 2),
  },
};

export default glyphs;
