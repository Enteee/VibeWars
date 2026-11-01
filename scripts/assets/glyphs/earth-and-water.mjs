// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, glyph } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  shard: {
    means: "An ice shard in flight, with its trail (#918).",
    draw: () => inkFill("M21 3L18 13L11 6Z") + inkLine("M12.5 11.5L4 20M9 9L5 13M15 15L11 19", 2),
  },
  "chill-skull": {
    means: "A snowflake with a skull at its heart: cold that kills.",
    draw: () =>
      inkLine("M12 2V22M3.4 7L20.6 17M3.4 17L20.6 7", 2) +
      `<circle cx="12" cy="12" r="5.2" fill="${C.ink}" stroke="${C.bg}" stroke-width="1.2"/>` +
      `<circle cx="10.2" cy="11.2" r="1.3" fill="${C.bg}"/><circle cx="13.8" cy="11.2" r="1.3" fill="${C.bg}"/>` +
      `<path d="M10.5 14.8h3" ${stroke(C.bg, 1.2)}/>`,
  },
  snowflake: {
    means: "A snowflake (#938): the area frozen, not a shard flying.",
    draw: () => inkLine("M12 3V21M4.2 7.5L19.8 16.5M4.2 16.5L19.8 7.5", 2.4),
  },
  quake: {
    means: "A cracked ground line with a ring of tremor above it (#992).",
    draw: () =>
      inkLine("M2.5 17L7 15L10 19L13.5 14L17 18L21.5 15.5", 2.4) +
      `<path d="M6.5 11A7 7 0 0 1 17.5 11M9.5 7.5A3.5 3.5 0 0 1 14.5 7.5" ${stroke(C.ink, 2)}/>`,
  },
  "snowflake-ground": {
    means: "A snowflake over a fouled ground: cold, and poison on a foe that is down.",
    draw: () =>
      `<g transform="translate(10,9) scale(0.7) translate(-12,-12)">${glyph("snowflake")}</g>` +
      `<g transform="translate(18,13) scale(0.5) translate(-12,-12)">${glyph("germ")}</g>` +
      inkLine("M2 21.5H22", 2.4),
  },
  "snowflake-hexed": {
    means:
      "A snowflake in a dashed ring with a germ: cold, and poison on a hexed or enchanted foe.",
    draw: () =>
      `<circle cx="10" cy="10" r="8" ${stroke(C.ink, 1.6)} stroke-dasharray="3.6 2.8"/>` +
      `<g transform="translate(10,10) scale(0.55) translate(-12,-12)">${glyph("snowflake")}</g>` +
      `<g transform="translate(18.5,18.5) scale(0.6) translate(-12,-12)">${glyph("germ")}</g>`,
  },
  "snowflake-recharge": {
    means: "A snowflake with a circling arrow: cold that recharges at once.",
    draw: () =>
      `<g transform="translate(10,10) scale(0.7) translate(-12,-12)">${glyph("snowflake")}</g>` +
      `<path d="M14 21A5.5 5.5 0 1 0 14.5 14" ${stroke(C.ink, 2)}/>` +
      inkLine("M12 12L15 14.5L12 17", 1.8),
  },
  "prism-fan": {
    means: "A prism with its light fanned out: cold that reaches the neighbours.",
    draw: () =>
      inkFill("M3 20L9 5L15 20Z") +
      `<path d="M9 5V20" ${stroke(C.bg, 1)}/>` +
      inkLine("M16 9L22 5M17 13H22.500M16 17L22 21", 2),
  },
  "crystals-crack": {
    means: "Two crystals over a crack: damage that breaks armor.",
    draw: () =>
      inkFill("M7 3L12 9L7 17L2 9Z") +
      inkFill("M17 5L21.500 10L17 17L12.500 10Z") +
      inkLine("M2 21L7 18.500L11 21L15 18.500L22 21", 2),
  },
  "sand-pulse": {
    means: "Rings of earth spreading from a point: the sandstorm pulses (#1573).",
    draw: () =>
      `<circle cx="12" cy="12" r="2.6" fill="${C.ink}"/>` +
      `<circle cx="12" cy="12" r="6.4" ${stroke(C.ink, 2)} stroke-dasharray="4 3"/>` +
      `<circle cx="12" cy="12" r="10" ${stroke(C.ink, 2)} stroke-dasharray="2 4.2"/>`,
  },
  "rift-strike": {
    means: "A bolt falling on a cracked ground line: a rift opens and strikes (#1319).",
    draw: () =>
      inkFill("M14.5 2L8 11.5H12.5L10 15.5L17 8H12.5Z") +
      inkLine("M3 20L8 17L11.5 20.5L15.5 16.5L21 19.5", 2.4),
  },
  "vapour-flame": {
    means: "Steam: rising vapour curls over a small flame.",
    draw: () =>
      `<g transform="translate(12,16.5) scale(0.55) translate(-12,-12)">${glyph("flame")}</g>` +
      inkLine(
        "M6 11C4.5 8.5 8 7.5 6.5 4.5M12 10C10.5 7.5 14 6.5 12.5 3.5M18 11C16.5 8.5 20 7.5 18.5 4.5",
        2,
      ),
  },
  frost: {
    means: "Shivers of Dread (#1931): a frost star, cold at the root of the fear.",
    draw: () =>
      inkLine("M12 2V22M3.3 7L20.7 17M3.3 17L20.7 7", 2) +
      inkLine("M9.5 3.8L12 6.3L14.5 3.8M9.5 20.2L12 17.7L14.5 20.2", 1.4),
  },
  "mountain-crack": {
    means: "A peak split by a crack: earth that breaks armor (#1034).",
    draw: () =>
      inkFill("M2 20L9.5 6L13.5 13L16.5 9L22 20Z") +
      `<path d="M9.8 6.5L12 11.5L9.5 14.5L11.5 20" fill="none" stroke="${C.bg}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  dust: {
    means: "A cloud of grains: dust thrown to blind (#1034).",
    draw: () =>
      [
        [7, 8],
        [13, 6],
        [18, 10],
        [10, 13],
        [14, 13.5],
        [6, 17],
        [12, 19],
      ]
        .map(
          ([x, y]) =>
            `<circle cx="${String(x)}" cy="${String(y)}" r="2.2" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>`,
        )
        .join(""),
  },
  mountain: {
    means: "Earth.",
    draw: () => inkFill("M2 20L9.5 6L13.5 13L16.5 9L22 20Z"),
  },
  rock: {
    means: "A rough boulder: a stone thrown (#1007).",
    draw: () => inkFill("M5 8L10 3.5L17 4.5L21 10L19 17L12 20.5L5.5 17.5L3.5 12Z"),
  },
  "ice-cage": {
    means: "A top bar with three icicles hanging from it: the cage of ice (#1440).",
    draw: () =>
      inkLine("M4 4.5H20", 2.6) + inkFill("M5 6H9.5L7.2 20ZM9.8 6H14.2L12 21ZM14.5 6H19L16.8 13Z"),
  },
  "frost-nova": {
    means: "A snowflake with ice thrown out round it: the cold bursts round the caster (#1440).",
    draw: () =>
      inkLine("M12 7.5V16.5M8.1 9.75L15.9 14.25M8.1 14.25L15.9 9.75", 2.4) +
      inkLine(
        "M12 1.5V4M12 20V22.5M1.5 12H4M20 12H22.5M4.6 4.6L6.4 6.4M17.6 17.6L19.4 19.4M4.6 19.4L6.4 17.6M17.6 6.4L19.4 4.6",
        2.2,
      ),
  },
  "mist-shield": {
    means: "A shield with mist lines drifting across it: armor and speed (#1440).",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M7.5 10c1.5-1.8 3-1.8 4.5 0s3 1.8 4.5 0M7.5 15c1.5-1.8 3-1.8 4.5 0s3 1.8 4.5 0", 2),
  },
  "stone-split": {
    means: "A stone split in two, chips flying from the crack: it bursts when it ends (#1440).",
    draw: () =>
      inkFill("M3 9L9 4L11.5 8L10 12L11.5 15L5 19L2.5 14Z") +
      inkFill("M15 5.5L21 8.5L20 13L14.5 13.5L14.5 10.5L13 8.5Z") +
      inkLine("M15 2L16.5 3.5M22 4L21 5.5", 1.8),
  },
  "stone-skin": {
    means: "Obsidian Flesh: a faceted black crystal, cut with light lines (#1605).",
    draw: () =>
      inkFill("M12 2.5L19.5 7V15L12 21.5L4.5 15V7Z") +
      `<path d="M12 2.5V21.5M4.5 7L12 12L19.5 7" fill="none" stroke="${C.bg}" stroke-width="1.6" stroke-linejoin="round"/>`,
  },
  chasm: {
    means: "Earthquake: the ground split by a chasm, rocks thrown up out of it (#1605).",
    draw: () =>
      inkLine("M2 15H9L11 21M22 15H15L13 21", 2.4) +
      inkFill("M10.2 3.5H13.8V7H10.2Z") +
      inkFill("M5 7.5H8.4V10.8H5Z") +
      inkFill("M15.6 7.5H19V10.8H15.6Z"),
  },
  "cloud-bolt": {
    means: "A cloud with a bolt falling out of it.",
    draw: () =>
      `<path d="M6.5 14.5a4 4 0 0 1 .5-7.9 5 5 0 0 1 9.6-.6 3.8 3.8 0 0 1 .9 8.5Z" ${stroke(C.ink, 2)}/>` +
      inkLine("M13 13L9.5 17.5H14L10.5 22", 2.2),
  },
  "crystal-glow": {
    means: "A faceted crystal with rays: a stone that glows.",
    draw: () =>
      inkFill("M12 7L18 13L12 22L6 13Z") +
      `<path d="M6 13H18M12 7L9.5 13L12 22L14.5 13Z" ${stroke(C.bg, 1)}/>` +
      inkLine("M12 1.5V4M4.5 4.5L6.5 6.5M19.5 4.5L17.5 6.5M2 11H4M22 11H20", 1.8),
  },
  "ground-pulse": {
    means: "Unsteady Ground: a pulsing ring with a crack through the earth above it (#1605).",
    draw: () =>
      `<ellipse cx="12" cy="17" rx="9.5" ry="4" ${stroke(C.ink, 2.2)}/>` +
      `<ellipse cx="12" cy="17" rx="4" ry="1.6" ${stroke(C.ink, 2)}/>` +
      inkLine("M4 8L8 11L11 5.5L14 11L17.5 7L20 10", 2.4),
  },
  "haze-heart-bar": {
    means: "haze heart bar",
    draw: () =>
      `<path d="M12 16s-5.5-3.4-5.5-7a3 3 0 0 1 5.5-1.7A3 3 0 0 1 17.5 9c0 3.6-5.5 7-5.5 7z" ${stroke(C.ink, 1.8)} stroke-dasharray="2.4 2"/>` +
      `<path d="M8 10h8M9 13h6" ${stroke(C.ink, 1.4)}/>` +
      `<rect x="3" y="18.5" width="18" height="3.5" rx="0.8" ${stroke(C.ink, 1.8)}/>` +
      `<rect x="3" y="18.5" width="4.5" height="3.5" rx="0.8" fill="${C.ink}"/>`,
  },
  "smoke-plume": {
    means: "A cloud of three puffs on the ground.",
    draw: () =>
      `<circle cx="8" cy="14" r="4.5" fill="${C.ink}"/><circle cx="14" cy="10.5" r="5.5" fill="${C.ink}"/><circle cx="18" cy="15" r="3.8" fill="${C.ink}"/>` +
      inkLine("M3 20.5H21", 2.4),
  },
};

export default glyphs;
