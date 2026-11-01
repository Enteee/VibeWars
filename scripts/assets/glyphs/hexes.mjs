// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import {
  inkFill,
  inkLine,
  punisher,
  burst,
  hexFail,
  healthGauge,
  RIDER,
  riderOn,
  glyph,
} from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "hex-wither": {
    means:
      "Necromancer staples 2 (#1583): the shapes of their statuses, so skill and status read as one. A dashed ring (a hex) round a hollow drop over two falling arrows: health and energy wither.",
    draw: () =>
      `<circle cx="12" cy="12" r="9.5" ${stroke(C.ink, 1.8)} stroke-dasharray="4.4 3.4"/>` +
      inkLine("M12 5.5c1.8 2.5 3 4 3 5.8a3 3 0 0 1-6 0c0-1.8 1.2-3.3 3-5.8z", 1.6) +
      inkLine("M8.5 15v3.5M7 17l1.5 1.5L10 17M15.5 15v3.5M14 17l1.5 1.5L17 17", 1.5),
  },
  "hex-haste-miss": {
    means:
      "A dashed ring (a hex) round a struck-through blade trailing speed lines: fast swings that miss.",
    draw: () =>
      `<circle cx="12" cy="12" r="9.5" ${stroke(C.ink, 1.8)} stroke-dasharray="4.4 3.4"/>` +
      inkLine("M5.5 9.5h3M5.5 12.5h3M5.5 15.5h3", 1.6) +
      inkLine("M10.5 15.5L16.5 8.5M10.5 8.5l6 7", 2),
  },
  "eye-high": {
    means: "An eye over a gauge past half: every enchantment stripped from a healthy foe.",
    draw: () =>
      `<g transform="translate(12,8.5) scale(0.8) translate(-12,-12)">${glyph("eye")}</g>` +
      healthGauge(0.7),
  },
  "hex-shards": {
    means: "Shards flying from a broken hex: a Mesmer hex shattered.",
    draw: () =>
      inkFill("M12 1.500L16 7L10 8Z") +
      inkFill("M22 11L16.500 16L15.500 9.500Z") +
      inkFill("M3 14L9 12L8.500 19Z") +
      `<circle cx="12.500" cy="14" r="2.200" fill="${C.ink}"/>`,
  },
  limp: {
    means: "A broken leg with a blade at the knee: it cripples (#1049).",
    draw: () => inkLine("M16 3L11.5 9.5L15 13L10 19", 2.4) + inkFill("M2.5 7.5L9.5 10L4.5 14Z"),
  },
  "hex-cut": {
    means: "A dashed ring (a hex) struck through: the hex is lifted (#1216).",
    draw: () =>
      `<circle cx="12" cy="12" r="8.5" ${stroke(C.ink, 2.2)} stroke-dasharray="4.2 3.2"/>` +
      inkLine("M20 4L4 20", 2.6),
  },
  "hex-hourglass": {
    means:
      "The punishers (#1473, #1534): one family, the dashed ring of a hex round a small picture of the punishment. An hourglass that bursts when its sand runs out: Wastrel's Worry.",
    draw: () =>
      punisher(
        inkLine("M5 3H19M5 21H19", 3) +
          inkFill(
            "M6.5 3.5H17.5C17.5 9 12 10 12 12C12 14 17.5 15 17.5 20.5H6.5C6.5 15 12 14 12 12C12 10 6.5 9 6.5 3.5Z",
          ),
      ),
  },
  "hex-overload": {
    means: "A bolt through a bar: Overload hits a foe in mid-skill.",
    draw: () =>
      punisher(inkLine("M2 12H22", 3) + inkFill("M14.5 2L6 13H11.5L9.5 22L18 10.5H12.5Z")),
  },
  "hex-crown": {
    means: "A crown: Price of Pride, the elite's toll.",
    draw: () => punisher(inkFill("M2.5 19L4 6L9 11.5L12 3L15 11.5L20 6L21.5 19Z")),
  },
  "hex-ache": {
    means: "A jagged ache: Migraine slows every skill.",
    draw: () => punisher(inkLine("M2 15L7.5 5L12 17L16.5 5L22 15", 3.4)),
  },
  "eye-tear": {
    means: "An eye with a tear: Visions of Regret.",
    draw: () =>
      punisher(
        inkLine("M1.5 9C6 2.5 18 2.5 22.5 9C18 15.5 6 15.5 1.5 9Z", 2.6) +
          inkFill("M12 6.3a2.7 2.7 0 1 0 .01 0Z") +
          inkFill("M12 15.5C10 18 9.3 19.5 9.3 21A2.7 2.7 0 0 0 14.7 21C14.7 19.5 14 18 12 15.5Z"),
      ),
  },
  "hex-splash": {
    means: "A burst: Unnatural Signet, the splash on a hexed foe.",
    draw: () => punisher(inkFill(burst(5))),
  },
  "hex-barbs": {
    means: "A dashed ring (a hex) with three spikes in it: blows from a weapon cut deeper (#1342).",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
      inkFill("M6 17.5L9.2 7L12.4 17.5ZM11.6 17.5L14.8 9.5L18 17.5Z"),
  },
  "hex-miss": {
    means: "A dashed ring (a hex) with a cross in it: every attack misses (#1342).",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
      inkLine("M8.2 8.2L15.8 15.8M15.8 8.2L8.2 15.8", 3),
  },
  "hex-drain": {
    means:
      "A dashed ring (a hex) with a pyramid of down triangles: health drains from a group (#1342).",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
      inkFill("M5.5 6.5H11.5L8.5 12ZM12.5 6.5H18.5L15.5 12ZM9 12.5H15L12 18Z"),
  },
  "hex-heal-cut": {
    means: "A dashed ring (a hex) with a plus and a down arrow: healing is cut (#1342).",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
      inkLine("M8.6 6.5V13M5.6 9.75H11.6", 2.6) +
      inkLine("M16.3 7V16M13.5 13L16.3 16.2L19.1 13", 2.6),
  },
  "hex-nobloc": {
    means: "A dashed ring (a hex) with a cracked shield: the foe cannot block (#1342).",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
      `<path d="M12 6L17 8V12.2C17 15 14.8 16.6 12 18C9.2 16.6 7 15 7 12.2V8Z" ${stroke(C.ink, 2)}/>` +
      inkLine("M12 8L10.5 12L13.5 13.5L12 17", 1.8),
  },
  "hex-drain-cut": {
    means:
      "A dashed ring (a hex) with a down triangle and a cut plus: it drains and cuts healing (#1342).",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
      inkFill("M5.8 6.8H11L8.4 11.8Z") +
      inkLine("M15.5 6.5V12.5M12.5 9.5H18.5", 2.4) +
      inkLine("M7 16H17", 2.6),
  },
  "hex-burst": {
    means: "A dashed ring (a hex) with a burst in it: the hex bursts on those near (#1217).",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
      inkFill(burst(5.5)),
  },
  "pain-cross": {
    means:
      "A cross with a ring either side: pain passed to who stands near, as the status shows (#1217).",
    draw: () =>
      inkLine("M9 8.5L15 14.5M15 8.5L9 14.5", 2.8) +
      `<circle cx="4.8" cy="17.5" r="2.3" ${stroke(C.ink, 1.8)}/><circle cx="19.2" cy="17.5" r="2.3" ${stroke(C.ink, 1.8)}/>`,
  },
  "eye-drop": {
    means: "An eye with a drop under it: a gaze that drinks (#1217).",
    draw: () =>
      `<path d="M2.5 8.5C5 4.5 8.5 3 12 3S19 4.5 21.5 8.5C19 12.5 15.5 14 12 14S5 12.5 2.5 8.5Z" ${stroke(C.ink, 2)}/>` +
      `<circle cx="12" cy="8.5" r="2.4" fill="${C.ink}"/>` +
      `<path d="M12 15.5C12 15.5 8.6 19 8.6 20.2A3.4 3.4 0 0 0 15.4 20.2C15.4 19 12 15.5 12 15.5Z" fill="${C.ink}"/>`,
  },
  "hex-energy-feast": {
    means: "hex energy feast",
    draw: () =>
      `<circle cx="10.5" cy="10.5" r="8" ${stroke(C.ink, 1.8)} stroke-dasharray="4 3"/>` +
      `<g transform="translate(10.5,10.5) scale(0.55) translate(-12,-12)">${glyph("energy")}</g>` +
      `<circle cx="18.5" cy="18" r="4.8" fill="${C.bg}"/><circle cx="18.5" cy="18" r="4.3" ${stroke(C.ink, 1.5)}/>` +
      `<g transform="translate(18.5,18) scale(0.3) translate(-12,-12)">${glyph("energy")}</g>`,
  },
  "hex-interrupt": {
    means: "hex interrupt",
    draw: () =>
      `<circle cx="12" cy="12" r="9.5" ${stroke(C.ink, 1.8)} stroke-dasharray="4.4 3.4"/>` +
      `<g transform="translate(12,12) scale(0.6) translate(-12,-12)">${inkFill(burst(6))}</g>`,
  },
  "eye-burst": {
    means: "eye burst",
    draw: () =>
      `<path d="M2.5 9C5 4.5 8.5 3 12 3S19 4.5 21.5 9C19 13.5 15.5 15 12 15S5 13.5 2.5 9Z" ${stroke(C.ink, 2)}/>` +
      `<circle cx="15" cy="9" r="2.3" fill="${C.ink}"/>` +
      `<g transform="translate(12,18.5) scale(0.5) translate(-12,-12)">${inkFill(burst(7))}</g>`,
  },
  "eye-heal": {
    means: "An eye with a ringed plus.",
    draw: () => riderOn(glyph("eye"), RIDER.plus),
  },
  "hex-bolt": {
    means: "A dashed ring (a hex) with a bolt through it: a hex smitten (#996).",
    draw: () =>
      `<circle cx="12" cy="12" r="8.5" ${stroke(C.ink, 2.2)} stroke-dasharray="4.2 3.2"/>` +
      inkLine("M14.5 3.5L9 12.5H15L9.5 20.5", 2.4),
  },
  "eye-crit": {
    means:
      "Paragon staples 4 (#1737). An eye with a four-point spark at its corner: the next attack strikes the eyes, critically.",
    draw: () =>
      `<path d="M2.5 14C5 9.5 8.5 7.5 12 7.5S19 9.5 21.5 14C19 18.5 15.5 20.5 12 20.5S5 18.5 2.5 14Z" ${stroke(C.ink, 2.2)}/>` +
      `<circle cx="12" cy="14" r="3" fill="${C.ink}"/>` +
      inkFill("M18 1.5L19.2 4.3L22 5.5L19.2 6.7L18 9.5L16.8 6.7L14 5.5L16.8 4.3Z"),
  },
  eye: {
    means: "An open eye: it sees the weak spot (#1001).",
    draw: () =>
      `<path d="M2.5 12C5 7.5 8.5 5.5 12 5.5S19 7.5 21.5 12C19 16.5 15.5 18.5 12 18.5S5 16.5 2.5 12Z" ${stroke(C.ink, 2.2)}/>` +
      `<circle cx="12" cy="12" r="3.4" fill="${C.ink}"/>`,
  },
  "hex-mute": {
    means: "A dashed ring (a hex) with a gag bar across it: spells are silenced (#1262).",
    draw: () =>
      `<circle cx="12" cy="12" r="8.5" ${stroke(C.ink, 2.2)} stroke-dasharray="4.2 3.2"/>` +
      inkLine("M6.5 12H17.5", 3.2),
  },
  "hex-fail-foe": {
    means:
      "A dashed ring (a hex), a small struck orb and a big mark: the bearer's next spell fails; an X is a foe it was aimed at, a disc with a plus an ally (#1498).",
    draw: () => hexFail(inkLine("M11.8 6.3L19.8 14.3M19.8 6.3L11.8 14.3", 3)),
  },
  "hex-fail-ally": {
    means: "No chevron, so the mark stays large at 16 px.",
    draw: () =>
      hexFail(
        `<circle cx="15.8" cy="10.3" r="5" fill="${C.ink}"/>` +
          `<path d="M15.8 7.6V13M13.1 10.3H18.5" ${stroke(C.bg, 1.8)}/>`,
      ),
  },
  "hex-churn": {
    means:
      "A dashed ring (a hex) round a drop with a plus and a minus either side: damage whenever a condition is gained or lost (#1498).",
    draw: () =>
      `<circle cx="12" cy="12" r="8.5" ${stroke(C.ink, 2.2)} stroke-dasharray="4.2 3.2"/>` +
      inkFill("M12 6.8C13.8 9.4 15.6 11 15.6 13.2A3.6 3.6 0 0 1 8.4 13.2C8.4 11 10.2 9.4 12 6.8Z") +
      inkLine("M4 9.5H7M5.5 8V11M17 15H20", 1.6),
  },
  "hex-panic": {
    means:
      "The crowd punishers (#1555). Panic: a skill used sends an interrupt out to everyone near, a dot with rays ending in dots. Wastrel's Demise: bars rising, the pulse that grows.",
    draw: () =>
      punisher(
        `<circle cx="12" cy="12" r="3.6" fill="${C.ink}"/>` +
          inkLine("M12 8V4M12 16V20M8 12H4M16 12H20", 2.6) +
          [
            [12, 2.5],
            [12, 21.5],
            [2.5, 12],
            [21.5, 12],
          ]
            .map(([x, y]) => `<circle cx="${String(x)}" cy="${String(y)}" r="2" fill="${C.ink}"/>`)
            .join(""),
      ),
  },
  "hex-rising": {
    means: "hex rising",
    draw: () => punisher(inkFill("M3 20V15H8V20ZM9.5 20V10H14.5V20ZM16 20V3.5H21V20Z")),
  },
  weight: {
    means: "A hung weight: a burden on the foe's legs (#1243).",
    draw: () =>
      `<path d="M7 7Q7 3 9.75 3T12.5 7" ${stroke(C.ink, 2.2)}/>` + inkFill("M4.5 7H15L16 14H3.5Z"),
  },
  "ache-cross": {
    means: "A jagged ache over a cross cut: pain now, a deep wound when it ends (#1243).",
    draw: () =>
      inkLine("M3.5 6L7 3.5L10.5 6L14 3.5L17.5 6", 2.2) +
      inkLine("M5.5 10.5L13.5 18.5M13.5 10.5L5.5 18.5", 3),
  },
  "eye-slash": {
    means: "An eye with a slash through it: the next attack is blinded (#1243).",
    draw: () =>
      `<g transform="scale(0.78)"><path d="M2.5 12C5 7.5 8.5 5.5 12 5.5S19 7.5 21.5 12C19 16.5 15.5 18.5 12 18.5S5 16.5 2.5 12Z" ${stroke(C.ink, 2.8)}/>` +
      `<circle cx="12" cy="12" r="3.4" fill="${C.ink}"/></g>` +
      inkLine("M3.5 17L16.5 3.5", 2.6),
  },
  "limp-drain": {
    means: "A limping line over two drain chevrons: slowed and bleeding health (#1243).",
    draw: () =>
      inkLine("M9 3L5 9.5L9 13.5L4 20", 2.8) +
      inkLine("M13 4.5L16.5 8L20 4.5M13 10L16.5 13.5L20 10", 2.2),
  },
  "eye-blur": {
    means: "An eye with a ghost of itself beside it: the foe sees double and misses (#1440).",
    draw: () =>
      `<path d="M2 12C4.5 8 7.5 6 11 6S17.5 8 20 12C17.5 16 14.5 18 11 18S4.5 16 2 12Z" ${stroke(C.ink, 2.4)}/>` +
      `<circle cx="11" cy="12" r="2.8" fill="${C.ink}"/>` +
      `<path d="M22 12C19.5 8 17 6 15 5.4" ${stroke(C.ink, 1.8)} stroke-dasharray="2 2.4"/>`,
  },
  "hex-return": {
    means:
      "The hex trigger is the dashed ring in the corner; the arrow goes back at its caster (#1440).",
    draw: () =>
      `<circle cx="6" cy="6" r="3.8" ${stroke(C.ink, 1.8)} stroke-dasharray="2.6 2"/>` +
      inkLine("M21 21L10.5 10.5M10.5 17V10.5H17", 2.4),
  },
  "hex-flame": {
    means: "Mark of Rodgort: the hex ring with a flame inside (#1572).",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.5 3.2"/>` +
      `<g transform="translate(12,12.5) scale(0.62) translate(-12,-12)">${glyph("flame")}</g>`,
  },
  "eye-plus": {
    means: "An eye over a plus: watched over, healed at the end (#1748).",
    draw: () =>
      inkLine("M3 8C7 3 17 3 21 8C17 13 7 13 3 8Z", 2) +
      `<circle cx="12" cy="8" r="2.2" fill="${C.ink}"/>` +
      inkLine("M12 15V22M8.5 18.5H15.5", 2.4),
  },
  "eye-flame": {
    means: "Glowing Gaze: an eye whose pupil is a flame, rays above it (#1605).",
    draw: () =>
      `<path d="M2.5 14C5 9.5 8.5 7.5 12 7.5S19 9.5 21.5 14C19 18.5 15.5 20.5 12 20.5S5 18.5 2.5 14Z" ${stroke(C.ink, 2.2)}/>` +
      `<g transform="translate(12,14) scale(0.46) translate(-12,-12)">${glyph("flame")}</g>` +
      inkLine("M12 1.5V4M5.5 3.5L7.3 5.5M18.5 3.5L16.7 5.5", 2),
  },
  "hex-shatter": {
    means: "A broken hex ring round a burst.",
    draw: () =>
      `<path d="M12 3A9 9 0 0 1 21 12M18 19.5A9 9 0 0 1 6 19.5M3 12A9 9 0 0 1 8 4" ${stroke(C.ink, 2.2)}/>` +
      `<g transform="translate(12,12) scale(0.5) translate(-12,-12)">${glyph("interrupt")}</g>`,
  },
  "hex-slow-star": {
    means: "The hex ring round a four-point star over crossed bars for spells that cast slowly.",
    draw: () =>
      punisher(
        inkFill("M12 1L14 6.5L19.5 8.5L14 10.5L12 16L10 10.5L4.5 8.5L10 6.5Z") +
          inkLine("M6 18H18M6 22H18M7 18L17 22M17 18L7 22", 2),
      ),
  },
  "eye-bar": {
    means: "eye bar",
    draw: () =>
      `<path d="M3.5 9C7 4.5 17 4.5 20.5 9C17 13.5 7 13.5 3.5 9z" ${stroke(C.ink, 1.8)}/>` +
      `<circle cx="12" cy="9" r="2" fill="${C.ink}"/>` +
      `<rect x="3" y="18.5" width="18" height="3.5" rx="0.8" ${stroke(C.ink, 1.8)}/>` +
      `<rect x="3" y="18.5" width="4.5" height="3.5" rx="0.8" fill="${C.ink}"/>`,
  },
  "hex-burden": {
    means: "A hex ring around a weight: a heavy burden that slows.",
    draw: () =>
      punisher(
        `<circle cx="12" cy="15" r="6" fill="${C.ink}"/>` +
          inkLine("M8.5 10.5C8.5 4.5 15.5 4.5 15.5 10.5", 2.4),
      ),
  },
  "hex-ghost": {
    means: "A hex ring around a ghost: fear in everything the foe does.",
    draw: () =>
      punisher(
        inkFill("M5 21V11A7 7 0 0 1 19 11V21L16 18.5L13 21L10 18.5L7 21Z") +
          `<circle cx="9.5" cy="11" r="1.6" fill="${C.bg}"/><circle cx="14.5" cy="11" r="1.6" fill="${C.bg}"/>`,
      ),
  },
  "hex-sword-limp": {
    means: "A hex ring around a sword hanging point down: attackers lose heart.",
    draw: () =>
      punisher(
        inkLine("M18 5L7 17", 3) +
          inkFill("M3.5 21L5.5 14.5L9.5 18.5Z") +
          inkLine("M13.5 2.8L20.5 9.2", 2.6),
      ),
  },
  "hex-bubble-cut": {
    means: "A hex ring around a speech bubble struck through: no shouts, no chants.",
    draw: () =>
      punisher(inkFill("M3 4H21V15H13L8 20V15H3Z") + `<path d="M2 20L22 3" ${stroke(C.bg, 3.4)}/>`),
  },
  "hex-sword-drop": {
    means: "The hex ring round a falling blade.",
    draw: () =>
      punisher(
        inkLine("M4 21L17 8", 2.8) +
          inkLine("M8 12L13 17", 2.6) +
          `<g transform="translate(18,6) scale(0.5) translate(-12,-12)">${glyph("interrupt")}</g>`,
      ),
  },
};

export default glyphs;
