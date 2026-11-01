// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import {
  inkFill,
  inkLine,
  punisher,
  burst,
  flameRing,
  healthGauge,
  healBadge,
  NOT,
  riderOn,
  glyph,
} from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "energy-cut": {
    means: "energy cut",
    draw: () => inkFill("M9 3L2 13.5H7L6 21L13 10.5H8Z") + inkLine("M15.5 17H22", 2.6),
  },
  fireball: {
    means: "fireball",
    draw: () =>
      `<circle cx="15" cy="9" r="5" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      inkLine("M10.5 12.5L4 19M9 8.5L3.5 11M14 14L11 20"),
  },
  "lightning-orb": {
    means: "An orb with a bolt through it: the shot is the orb, the element the bolt.",
    draw: () =>
      `<circle cx="12" cy="12" r="8" ${stroke(C.ink, 2)}/>` +
      inkLine("M13.5 5.5L9.5 12H14.5L10.5 18.5", 2),
  },
  lightning: {
    means: "A bolt in a line, from above (#918): lightning, not the filled energy bolt.",
    draw: () => inkLine("M15 2.5L8.5 12.5H15.5L9 21.5", 2.6),
  },
  "energy-ring": {
    means: "A bolt inside a ring: Energizing Finale (#1524).",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 1.8)}/>` +
      inkFill("M13.5 4.5L7.5 13H11.5L10.5 19.5L16.5 11H12.5Z"),
  },
  meteor: {
    means: "A jagged rock dropping straight down onto the ground, streaks above it (#992).",
    draw: () =>
      inkFill("M6 10L10 6.5L15.5 8L17 13L13.5 17L8 16Z") +
      inkLine("M8 3V5M12.5 1.5V4.5M16.5 3V6M3 11V13", 2) +
      inkLine("M2.5 20.5H14M4.5 18.5L6 19.5", 2.2),
  },
  "gust-bar": {
    means: "A gust held back by a bar: the hexed foe slows.",
    draw: () =>
      inkLine("M2.500 7.500H11A2.800 2.800 0 1 0 8.200 4.700", 2.2) +
      inkLine("M2.500 13H14M2.500 18.500H10", 2.2) +
      inkLine("M19.500 4V20", 2.8),
  },
  "spark-bars": {
    means: "A spark over a falling bar: energy for every hit (#1645).",
    draw: () => inkLine("M12 2.5L14.5 8H9.5L12 13.5", 2.2) + inkLine("M5 17H19M8 21H16", 2.4),
  },
  "wind-rend": {
    means: "Wind curls streaming under a broken ring: gusts that unravel enchantments.",
    draw: () =>
      `<path d="M12 3.5A8.5 8.5 0 0 1 20.5 12M18 18A8.5 8.5 0 0 1 8 20" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M3 9H13a2.5 2.5 0 1 0-2.5-2.5M3 14H17a2.8 2.8 0 1 1-2.8 2.8", 2),
  },
  "spark-vow": {
    means: "A spark over two falling bars with a minus: energy per hit, regeneration paid.",
    draw: () =>
      inkLine("M12 2.5L14.5 8H9.5L12 13.5", 2.2) +
      inkLine("M5 17H19M8 21H16", 2.4) +
      inkLine("M18.5 5H22.5", 2),
  },
  twister: {
    means: "A tornado: bars narrowing to a point, a whirlwind round the caster (#990).",
    draw: () => inkLine("M3.5 5H20.5M6 9.5H18M8.5 14H15.5M11 18.5H13.5", 2.4),
  },
  "bolt-cap": {
    means: "A bolt under a ceiling: energy per hit, up to a cap (#1396).",
    draw: () => inkFill("M13.5 7L8.5 14.5H12L11 21L16 13H12.5Z") + inkLine("M4.5 4.5H19.5", 2.2),
  },
  "meteor-trio": {
    means: "Three rocks falling in a staggered line, a trail behind each: the shower (#1214).",
    draw: () =>
      [
        [18, 8],
        [13, 12],
        [8, 16],
      ]
        .map(
          ([x, y]) =>
            `<circle cx="${String(x)}" cy="${String(y)}" r="2.6" fill="${C.ink}"/>` +
            inkLine(
              `M${String((x ?? 0) - 2.5)} ${String((y ?? 0) - 2.5)}L${String((x ?? 0) - 4.5)} ${String((y ?? 0) - 4.5)}`,
              2,
            ),
        )
        .join("") + inkLine("M4 21H20", 2),
  },
  "orb-split": {
    means: "An orb split by a crack: Frustration hurts when a spell is broken off.",
    draw: () =>
      punisher(
        `<path d="M11 3A9 9 0 0 0 11 21L9 17L12 12L9.5 8Z" fill="${C.ink}"/>` +
          `<path d="M13.5 3.5A9 9 0 0 1 13 20.5L11 17L14 12L11.5 8Z" fill="${C.ink}" transform="translate(2.5,0)"/>`,
      ),
  },
  "fireball-mind": {
    means: "A fireball with an eye in it: Mind Blast.",
    draw: () =>
      `<circle cx="14" cy="10" r="7" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      inkLine("M8.5 14.5L3 20M7 9L3 11.5M12.5 17L10 21.5") +
      `<circle cx="14" cy="10" r="3" ${stroke(C.bg, 1.6)}/><circle cx="14" cy="10" r="1" fill="${C.bg}"/>`,
  },
  spark: {
    means: "A four-point spark with a short tail: the cheap single bolt of fire (#1397).",
    draw: () =>
      inkFill("M15 2L17.2 9.8L24 12L17.2 14.2L15 22L12.8 14.2L6 12L12.8 9.8Z") +
      inkLine("M10 14L3.5 20.5M8.5 9L3 7", 2),
  },
  "flame-foe": {
    means: "A flame over a head and shoulders: a foe set alight (#1397).",
    draw: () =>
      `<circle cx="12" cy="14" r="3" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      `<path d="M4.5 22C4.5 18 7.5 17 12 17S19.5 18 19.5 22Z" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      inkFill(
        "M12.5 1.5c.4 2.6 3.4 3.8 3.4 6.8a3.9 3.9 0 0 1-7.8 0c0-1.8.7-3 1.8-3.8 0 1.4.4 2.1 1.1 2.4-.3-2.1.3-3.9 1.5-5.4z",
      ),
  },
  "flame-mind": {
    means: "A flame over a bare head: the mind burns (#1397).",
    draw: () =>
      `<path d="M12 10C7 10 4.5 13 4.5 16.5C4.5 19 6.5 20.5 9 20.5V22H15V20.5C17.5 20.5 19.5 19 19.5 16.5C19.5 13 17 10 12 10Z" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      inkFill(
        "M12.5 1.5c.4 2.6 3.4 3.8 3.4 6.8a3.9 3.9 0 0 1-7.8 0c0-1.8.7-3 1.8-3.8 0 1.4.4 2.1 1.1 2.4-.3-2.1.3-3.9 1.5-5.4z",
      ),
  },
  "flame-ring": {
    means: "A tight ring of flame points round a dot: fire on all beside you (#1397).",
    draw: () =>
      flameRing(6.5, 10, 2, false) +
      inkFill(
        "M12.5 6.5c.4 2.2 2.8 3.2 2.8 5.6a3.3 3.3 0 0 1-6.6 0c0-1.5.6-2.5 1.5-3.2 0 1.2.3 1.8.9 2-.2-1.8.2-3.2 1.4-4.4z",
      ),
  },
  "flame-burst": {
    means: "Long rays from a dot out to the edge: a big burst round you (#1397).",
    draw: () => flameRing(4, 11.5, 2.4),
  },
  "flame-target": {
    means: "A target ring with a small flame inside: a burst on the foe (#1397).",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2)}/>` +
      inkFill(
        "M12.5 4.5c.4 2.4 3.2 3.6 3.2 6.4a3.7 3.7 0 0 1-7.4 0c0-1.7.7-2.8 1.7-3.6 0 1.3.4 2 1.1 2.3-.3-2 .3-3.7 1.4-5.1z",
      ),
  },
  "flame-field": {
    means: "Three flames on the ground: a storm that stays where it fell (#1397).",
    draw: () =>
      inkLine("M2 21.5H22", 2.2) +
      inkFill(
        "M6 8c.3 2.4 2.8 3.4 2.8 6a3.1 3.1 0 0 1-6.2 0c0-1.5.6-2.5 1.5-3.2 0 1.2.3 1.8.9 2-.2-1.8.2-3.2 1-4.8z",
      ) +
      inkFill(
        "M12 2c.4 3.4 4 5 4 9a4.5 4.5 0 0 1-9 0c0-2.2.9-3.6 2.2-4.6 0 1.7.5 2.6 1.4 3-.4-2.6.4-4.9 1.4-7.4z",
      ) +
      inkFill(
        "M18 8c.3 2.4 2.8 3.4 2.8 6a3.1 3.1 0 0 1-6.2 0c0-1.5.6-2.5 1.5-3.2 0 1.2.3 1.8.9 2-.2-1.8.2-3.2 1-4.8z",
      ),
  },
  "energy-feast": {
    means:
      "Mesmer staples 3 (#1627, #1666): the ringed plus is Health healed per Energy lost, the ringed bolt Energy gained; the hex ring is a hex taken.",
    draw: () =>
      `<g transform="translate(10,10) scale(0.85) translate(-12,-12)">${glyph("energy")}</g>` +
      healBadge(),
  },
  "vortex-hex": {
    means: "vortex hex",
    draw: () =>
      inkLine(
        "M12 12a1.6 1.6 0 0 1 3.2 0a3.6 3.6 0 0 1-7.2 0a5.6 5.6 0 0 1 11.2 0a7.6 7.6 0 0 1-15.2 0",
        2.2,
      ) + `<g transform="translate(20,4) scale(0.4) translate(-12,-12)">${inkFill(burst(6))}</g>`,
  },
  "energy-quiet": {
    means: "energy quiet",
    draw: () => riderOn(glyph("energy"), NOT.chant),
  },
  "bolt-ring": {
    means: "Power Leech (#1931): a bolt of energy inside a dashed ring, drawn out of it.",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 1.6)} stroke-dasharray="3 2.4"/>` +
      inkFill("M13 5L8 12.5H11.5L10.5 19L16 11H12.5Z"),
  },
  nova: {
    means: "Death Nova (#1931): a blast ringing out from a core.",
    draw: () =>
      `<circle cx="12" cy="12" r="3.6" fill="${C.ink}"/>` +
      inkLine(
        Array.from({ length: 8 }, (_, i) => {
          const a = (Math.PI * i) / 4;
          const p = (r) =>
            `${(12 + r * Math.cos(a)).toFixed(1)} ${(12 + r * Math.sin(a)).toFixed(1)}`;
          return `M${p(6.8)}L${p(10.5)}`;
        }).join(""),
        2.2,
      ),
  },
  energy: {
    means: "energy",
    draw: () => inkFill("M13 2L5 13.5H11L10 22L19 10H13Z"),
  },
  flame: {
    means: "flame",
    draw: () =>
      inkFill(
        "M14 3c.6 4 5 6 5 11a7 7 0 0 1-14 0c0-3 1.2-5.2 3-6.4 0 2.3.6 3.5 1.8 4.1-.6-3.5 1.2-7 4.2-8.7z",
      ),
  },
  "bolt-plus": {
    means: "A bolt over a low health gauge: Energy for the allies who are hurt.",
    draw: () => inkFill("M13 1.5L6 11H11L9.5 16L17 7H12Z") + healthGauge(0.3),
  },
  "bolt-pips": {
    means: "A bolt over two rising pips: Energy that keeps coming.",
    draw: () =>
      inkFill("M13.5 2.5L6.5 12H11.5L10.5 17.5L17.5 8H12.5Z") +
      inkLine("M5 21.5L8 18.5L11 21.5M13 21.5L16 18.5L19 21.5", 2),
  },
  "flame-halo": {
    means: "A flame under a halo: holy attacks, and it burns when it ends (#1447).",
    draw: () =>
      `<ellipse cx="12" cy="4.8" rx="6" ry="2.2" ${stroke(C.ink, 2)}/>` +
      inkFill(
        "M12.5 8c3 3 6.5 5.2 6.5 9.5a7 7 0 0 1-14 0c0-2.8 1.2-5 3-6.2 0 2.2.6 3.4 1.8 4-.6-3.3 1-5.6 2.7-7.3z",
      ),
  },
  "flame-bars": {
    means: "A flame beside three rising bars: it burns, and adrenaline comes (#1447).",
    draw: () =>
      inkFill(
        "M8.5 3.5c2.8 2.8 4.5 5 4.5 8.5a5 5 0 0 1-10 0c0-2 .8-3.6 2.2-4.8 0 1.7.5 2.6 1.4 3-.4-2.6.3-4.4 1.9-6.7z",
      ) + inkLine("M15 21v-5M18.5 21V12M22 21V8M3 22H13", 2.2),
  },
  "lava-spouts": {
    means: "Lava Font: a wavy ground, three tongues of fire rising from it (#1572).",
    draw: () =>
      inkLine("M2 20Q5 17 8 20T14 20T22 20", 2.4) +
      [
        [5.5, 0.5],
        [12, 0.8],
        [18.5, 0.5],
      ]
        .map(
          ([x, k]) =>
            `<g transform="translate(${String(x)},${String(14 - 6 * k)}) scale(${String(k)}) translate(-12,-12)">${glyph("flame")}</g>`,
        )
        .join(""),
  },
  "flame-rise": {
    means: "Infuriating Heat: rising bars, a flame above (#1572).",
    draw: () =>
      inkLine("M5 21V17M12 21V14M19 21V11", 2.6) +
      `<g transform="translate(12,7) scale(0.6) translate(-12,-12)">${glyph("flame")}</g>`,
  },
  "gust-curl": {
    means: "Gale: two wind curls streaming left, the lower one rolling over (#1605).",
    draw: () =>
      inkLine("M2.5 8H14.5A3.2 3.2 0 1 0 11.3 4.8", 2.4) +
      inkLine("M2.5 13.5H19A3.2 3.2 0 1 1 15.8 16.7", 2.4) +
      inkLine("M2.5 19H9", 2.4),
  },
  "bolt-drain": {
    means:
      "Elementalist staples 3 (#1710). A bolt with a minus in a ring: lightning that drains Energy.",
    draw: () =>
      inkLine("M12 2.5L5.5 12.5H12L6.5 21.5", 2.6) +
      `<circle cx="18" cy="16" r="4.2" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M15.8 16H20.2", 2),
  },
  "bolt-arc": {
    means: "A bolt that arcs on to a second dot: lightning that jumps.",
    draw: () =>
      inkLine("M5 2.5L2.5 9.5H8L5.5 15.5", 2.2) +
      inkLine("M8 8L14 7L12 13L19 11", 2) +
      `<circle cx="20" cy="17" r="2.6" fill="${C.ink}"/>` +
      inkLine("M19 11L20 14", 2),
  },
  "gust-fast": {
    means: "Gale lines streaming under forward chevrons: speed.",
    draw: () =>
      inkLine("M2.5 8H12A2.8 2.8 0 1 0 9.2 5.2", 2.2) +
      inkLine("M2.5 14.5H14", 2.2) +
      inkLine("M2.5 20H10", 2.2) +
      inkLine("M15 6.5L19 12L15 17.5M19 6.5L23 12L19 17.5", 1.8),
  },
  volcano: {
    means: "A volcano with fire thrown from its top.",
    draw: () =>
      inkFill("M2 21L8.5 10H15.5L22 21Z") +
      inkLine("M12 7V2M8 8L5.5 4M16 8L18.5 4", 2.2) +
      `<circle cx="3.5" cy="8" r="1.2" fill="${C.ink}"/><circle cx="20.5" cy="8" r="1.2" fill="${C.ink}"/>`,
  },
  "flame-splash": {
    means: "Liquid Flame: a flame over a wavy pool, drops thrown out to both sides (#1605).",
    draw: () =>
      `<g transform="translate(12,9) scale(0.75) translate(-12,-12)">${glyph("flame")}</g>` +
      inkLine("M3 20C5.5 17.5 8.5 22.5 12 20S18.5 17.5 21 20", 2.2) +
      `<circle cx="3.8" cy="12.5" r="1.7" fill="${C.ink}"/><circle cx="20.2" cy="12.5" r="1.7" fill="${C.ink}"/>`,
  },
  "breath-fire": {
    means: "A cone of fire widening to the right, with a wavy front: the breath.",
    draw: () =>
      inkLine("M2 8H8M2 12H7M2 16H8", 2.2) +
      `<g transform="translate(5,1)">${inkFill("M14 3c.6 4 5 6 5 11a7 7 0 0 1-14 0c0-3 1.2-5.2 3-6.4 0 2.3.6 3.5 1.8 4.1-.6-3.5 1.2-7 4.2-8.7z")}</g>`,
  },
  "flame-wings": {
    means: "Golden Phoenix Strike: a flame with swept wings, a blade point under it (#1617).",
    draw: () =>
      `<g transform="translate(12,8) scale(0.8) translate(-12,-12)">${glyph("flame")}</g>` +
      inkLine("M2.5 5C3.5 11 7 13.5 10.5 13.5M21.5 5C20.5 11 17 13.5 13.5 13.5", 2.4) +
      inkLine("M12 14.5V18", 2.4) +
      inkFill("M9.5 18H14.5L12 22.5Z"),
  },
};

export default glyphs;
