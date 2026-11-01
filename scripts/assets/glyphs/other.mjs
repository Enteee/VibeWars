// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, germ, stepAndReturn, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, punisher, burst, attune, glyph } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "interrupt-struck": {
    means:
      "Payoffs of the chants of #1558: a burst struck through (cannot be interrupted), a bolt with a minus (costs less), a ring filled above its middle with a chevron up (more damage to foes above half).",
    draw: () =>
      inkFill(burst(6)) +
      `<path d="M3 21L21 3" ${stroke(C.bg, 4.4)}/>` +
      inkLine("M3 21L21 3", 2.2),
  },
  "burst-skull": {
    means: "A burst round a skull: a corpse blown apart.",
    draw: () =>
      inkFill(burst(8)) +
      `<circle cx="12" cy="12" r="5.6" fill="${C.bg}"/>` +
      `<circle cx="12" cy="11.5" r="4" fill="${C.ink}"/>` +
      `<circle cx="10.4" cy="11" r="1.1" fill="${C.bg}"/><circle cx="13.6" cy="11" r="1.1" fill="${C.bg}"/>` +
      `<path d="M10.5 14.2v1.4M12 14.2v1.4M13.5 14.2v1.4" ${stroke(C.bg, 0.9)}/>`,
  },
  "blades-fan": {
    means: "Hundred Blades: three blades fanned from one hilt, swept through the crowd.",
    draw: () =>
      inkLine("M4.5 20L17 4.5M4.5 20L21 11M4.5 20L11 2.5", 2.6) + inkLine("M3 21.5l3-3", 2.8),
  },
  flash: {
    means: "A white-hot disc ringed by rays: a flash that blinds (#992).",
    draw: () =>
      `<circle cx="12" cy="12" r="4.2" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      inkLine(
        "M12 2.5V6M12 18V21.5M2.5 12H6M18 12H21.5M5.3 5.3L7.8 7.8M16.2 16.2L18.7 18.7M18.7 5.3L16.2 7.8M7.8 16.2L5.3 18.7",
        2,
      ),
  },
  "chevrons-siphon": {
    means: "Chevrons forward over chevrons dragged against a bar: slow them, speed yourself.",
    draw: () =>
      inkLine("M3 4L7 8L3 12M9 4L13 8L9 12M15 4L19 8L15 12", 2.2) +
      inkLine("M3 15L7 19L3 23M9 15L13 19L9 23", 2.2) +
      inkLine("M20 15V23", 2.6),
  },
  "feather-swift": {
    means: "A feather with speed chevrons: moves faster, sheds conditions sooner.",
    draw: () =>
      `<path d="M19 3C11 4 7 10 7 19M19 3c0 7-5 11-11 12" ${stroke(C.ink, 2)}/>` +
      inkLine("M3 9L6 12L3 15M3 17L6 20L3 23", 1.6),
  },
  "spiral-charge": {
    means: "A spiral of wind ending in an arrowhead: the charge that chills the crowd.",
    draw: () =>
      `<path d="M12 12a2 2 0 1 1 2-2a4 4 0 1 1-4-4a6 6 0 1 1-6 6" ${stroke(C.ink, 2)}/>` +
      inkLine("M1.5 14L4 18L8 15.5", 2),
  },
  "blink-bars": {
    means: "The step arrowheads behind bars: a shadow step into a prison (#1573).",
    draw: () =>
      `<path d="M2.5 6L6.5 11L2.5 16Z" ${stroke(C.ink, 1.5)}/>` +
      inkLine("M10 3V21M14 3V21M18 3V21M7.5 3.5H20.5M7.5 20.5H20.5", 2),
  },
  "speed-heal": {
    means: "Two chevrons and a plus: allies hurried along and healed as they go (#959).",
    draw: () => inkLine("M3 6L8 12L3 18M9 6L14 12L9 18", 2.4) + inkLine("M19 8V16M15 12H23", 2.4),
  },
  interrupt: {
    means: "interrupt",
    draw: () => inkFill(burst(6)),
  },
  pin: {
    means: "An arrow driven down into a ground bar: pinned in place (#981).",
    draw: () =>
      inkLine("M12 3V14", 2.4) + inkFill("M12 20.5L7 13H17Z") + inkLine("M4 21.5H20", 2.4),
  },
  retreat: {
    means: "Chevrons and a bar, as on the Escape stance (#981).",
    draw: () => inkLine("M3 6L9 12L3 18M10 6L16 12L10 18", 2.5) + inkLine("M20 5V19", 2.6),
  },
  speed: {
    means: "Chevrons right.",
    draw: () => inkLine("M4 4L10 12L4 20M11 4L17 12L11 20", 2.5),
  },
  rush: {
    means: "Three chevrons: a stance that hurries the bearer (#1396).",
    draw: () => inkLine("M3 5L9 12L3 19M9.5 5L15.5 12L9.5 19M16 5L22 12L16 19", 2.2),
  },
  slow: {
    means: "Chevrons left.",
    draw: () => inkLine("M20 4L14 12L20 20M13 4L7 12L13 20", 2.5),
  },
  dash: {
    means: "dash",
    draw: () => inkLine("M3 7H11M2 12H9M3 17H11", 2) + inkLine("M13 4L21 12L13 20", 2.6),
  },
  "crown-struck": {
    means: "A crown struck through: Signet of Humility shuts an elite off.",
    draw: () =>
      punisher(
        inkFill("M3 18L4.5 6.5L9 11.5L12 4L15 11.5L19.5 6.5L21 18Z") +
          `<path d="M2 22L22 2" stroke="${C.bg}" stroke-width="6" stroke-linecap="round"/>` +
          inkLine("M2 22L22 2", 3),
      ),
  },
  blink: {
    means: "An arrowhead leaving two hollow ones behind it: a step through the shadows (#1217).",
    draw: () =>
      `<path d="M3.5 5L8.5 10L3.5 15Z" ${stroke(C.ink, 1.6)}/>` +
      `<path d="M9 5L14 10L9 15Z" ${stroke(C.ink, 1.6)}/>` +
      inkFill("M15 4.5L21 10L15 15.5Z"),
  },
  "blink-heal": {
    means: "The step with a plus under it: it heals as it goes (#1349).",
    draw: () =>
      `<path d="M2.5 3L7.5 8L2.5 13Z" ${stroke(C.ink, 1.6)}/>` +
      `<path d="M8 3L13 8L8 13Z" ${stroke(C.ink, 1.6)}/>` +
      inkFill("M14 2.5L20 8L14 13.5Z") +
      inkLine("M5 20.5H13M9 16.5V24.5", 2.4),
  },
  "blink-fang": {
    means: "The step with two fangs under it: it poisons what it leaves behind (#1349).",
    draw: () =>
      `<path d="M2.5 3L7.5 8L2.5 13Z" ${stroke(C.ink, 1.6)}/>` +
      `<path d="M8 3L13 8L8 13Z" ${stroke(C.ink, 1.6)}/>` +
      inkFill("M14 2.5L20 8L14 13.5Z") +
      inkFill("M3 16H8.5L5.75 23ZM9.5 16H15L12.25 23Z"),
  },
  "blink-ally": {
    means: "The step ending at a figure: it goes to an ally (#1349).",
    draw: () =>
      `<path d="M2.5 3L7.5 8L2.5 13Z" ${stroke(C.ink, 1.6)}/>` +
      `<path d="M8 3L13 8L8 13Z" ${stroke(C.ink, 1.6)}/>` +
      `<circle cx="18.5" cy="5.5" r="3" fill="${C.ink}"/>` +
      inkFill("M12.5 15C12.5 10.5 24.5 10.5 24.5 15Z") +
      inkLine("M4 20.5H20", 2.4),
  },
  "crescent-spark": {
    means: "A crescent, a critical spark and a plus: health from each critical hit (#1349).",
    draw: () =>
      inkFill("M9 2.5a6 6 0 1 0 0 11a4.8 4.8 0 0 1 0-11z") +
      inkFill("M17.5 7L19 11L23 12.5L19 14L17.5 18L16 14L12 12.5L16 11Z") +
      inkLine("M6 17.5V23.5M3 20.5H9", 2.4),
  },
  "attune-fire": {
    means:
      "The Elementalist's energy engine (#1614, #1646): the Attunements share one cue, a ringed bolt in the corner.",
    draw: () => attune(glyph("flame")),
  },
  "attune-water": {
    means: "attune water",
    draw: () => attune(glyph("snowflake")),
  },
  "attune-air": {
    means: "attune air",
    draw: () => attune(glyph("lightning")),
  },
  "attune-earth": {
    means: "attune earth",
    draw: () => attune(glyph("mountain")),
  },
  leaf: {
    means:
      "Natural Healing, Natural Temper (#1916): a leaf, what a skill does while nothing is enchanted.",
    draw: () => inkFill("M4 20C4 10 9 4 20 4C20 15 14 20 4 20Z") + inkLine("M4 20L13 11", 1.2),
  },
  "burst-bolt": {
    means: "Power Flux (#1931): the interrupt's burst with a bolt cut out of it, energy bled away.",
    draw: () =>
      `<path fill-rule="evenodd" fill="${C.ink}" d="${burst(6)}M13.5 6.5L8.5 12.5H11.5L10.5 17.5L15.5 11H12.5Z"/>`,
  },
  chain: {
    means:
      "Chain Lightning (#461): a jagged bolt through three foes, not the energy bolt, which means energy.",
    draw: () =>
      inkLine("M4.5 5L10 10.5L7.5 12.5L12 19L15 12L12.5 10.5L19.5 5.5", 1.8) +
      [
        [4.5, 5],
        [12, 19],
        [19.5, 5.5],
      ]
        .map(
          ([cx, cy]) =>
            `<circle cx="${String(cx)}" cy="${String(cy)}" r="2.6" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>`,
        )
        .join(""),
  },
  thorns: {
    means: "A bramble stem with barbs: thorns (#1034).",
    draw: () =>
      inkLine("M3.5 19.5C8 17 14 12 20.5 4.5", 2.2) +
      inkLine("M7.5 16L6 11M11 13.5L9.5 8.5M15 10.5L14.5 5M9 17.5L12 21M12.5 13L14.5 15", 2.2),
  },
  cleanse: {
    means: "Drop, struck through.",
    draw: () =>
      `<path d="M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z" ${stroke(C.ink, 2)}/>` +
      inkLine("M4 4L20 20", 2.4),
  },
  flask: {
    means: "flask",
    draw: () =>
      `<path d="M9.5 3H14.5M10.5 3V9L4.5 19Q3.5 21 6 21H18Q20.5 21 19.5 19L13.5 9V3" ${stroke(C.ink, 2)}/>` +
      inkFill("M7.5 15H16.5L19 19.5H5Z"),
  },
  germ: {
    means: "germ",
    draw: () => germ(C.ink),
  },
  crescent: {
    means: "A crescent: shadow, the cover an assassin heals in (#1001).",
    draw: () => inkFill("M15 3A9 9 0 1 0 15 21A11 11 0 0 1 15 3Z"),
  },
  "target-struck": {
    means:
      "A target ring struck through: nothing foreign can aim at them. Reusable for any untargetable skill.",
    draw: () =>
      `<circle cx="12" cy="12" r="6" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M12 2.5V6.5M12 17.5V21.5M2.5 12H6.5M17.5 12H21.5", 2.2) +
      `<circle cx="12" cy="12" r="1.4" fill="${C.ink}"/>` +
      `<path d="M4.5 19.5L19.5 4.5" ${stroke(C.bg, 4.6)}/>` +
      inkLine("M4.5 19.5L19.5 4.5", 2.2),
  },
  "draw-drops": {
    means: "A figure at the left with two drops flowing into it: conditions taken on, and healed.",
    draw: () =>
      `<circle cx="6" cy="8" r="3" fill="${C.ink}"/>` +
      inkLine("M1.5 20C1.5 15.5 3.5 13 6 13S10.5 15.5 10.5 20", 2.6) +
      inkLine("M12.5 12.5H17M12.5 17.5H17", 1.8) +
      inkFill("M19.5 9.5C18 11.5 17 12.6 17 13.8A2.5 2.5 0 0 0 22 13.8C22 12.6 21 11.5 19.5 9.5Z") +
      inkFill(
        "M19.5 15C18.3 16.6 17.6 17.4 17.6 18.3A1.9 1.9 0 0 0 21.4 18.3C21.4 17.4 20.7 16.6 19.5 15Z",
      ),
  },
  "mark-skull": {
    means: "A skull: the mark of death (#1262).",
    draw: () =>
      inkFill(
        "M11 3C6.8 3 4 5.8 4 9.5C4 12 5.3 13.5 7.5 14.5V19H14.5V14.5C16.7 13.5 18 12 18 9.5C18 5.8 15.2 3 11 3Z",
      ) +
      `<circle cx="8" cy="9.5" r="2" fill="${C.bg}"/><circle cx="14" cy="9.5" r="2" fill="${C.bg}"/>`,
  },
  "speed-break": {
    means: "A whole chevron and a broken one: fast now, crippled after (#1243).",
    draw: () =>
      inkLine("M3.5 5L10 12L3.5 19", 2.6) + inkLine("M13.5 5L16.5 8.5M16.5 14L13.5 17.5", 2.4),
  },
  "haste-clean": {
    means: "Two chevrons and a drop outline: faster, and a condition leaves (#1447).",
    draw: () =>
      inkLine("M3 5L8.5 12L3 19M9.5 5L15 12L9.5 19", 2.4) +
      `<path d="M19 7.5c1.8 2.7 3 4.2 3 6a3 3 0 0 1-6 0c0-1.8 1.2-3.3 3-6z" ${stroke(C.ink, 1.9)}/>` +
      inkLine("M15 6L23 21", 2.2),
  },
  chase: {
    means: "A chevron running after a dot, a spark off it: faster, and harder on a runner (#1447).",
    draw: () =>
      inkLine("M3 5L9.5 12L3 19", 2.6) +
      `<circle cx="15" cy="12" r="2.8" fill="${C.ink}"/>` +
      inkLine("M19.5 6.5L22 4M19.5 17.5L22 20M20.5 12H23", 2),
  },
  "head-frost": {
    means: "A head and shoulders with a snowflake in the head: the mind freezes (#1440).",
    draw: () =>
      `<circle cx="12" cy="9" r="6.5" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M12 5.5V12.5M8.9 7.2L15.1 10.8M8.9 10.8L15.1 7.2", 1.8) +
      inkLine("M4 22C4 18 7.5 16.5 12 16.5S20 18 20 22", 2.2),
  },
  "gain-barbs": {
    means:
      "The gain trigger: a plus in the top left corner is what the foe gains; the payoff sits below and right (#1440).",
    draw: () =>
      inkLine("M5.5 2.5V9.5M2 6H9", 2.2) +
      inkFill("M6.5 21.5L10.5 11L14 21.5ZM12.5 21.5L16.5 9.5L21 21.5Z"),
  },
  "gain-shield": {
    means: "gain shield",
    draw: () =>
      inkLine("M5.5 2.5V9.5M2 6H9", 2.2) +
      inkFill("M15 9L21.5 11.5V16C21.5 19 18.5 21 15 22.5C11.5 21 8.5 19 8.5 16V11.5Z") +
      `<path d="M16 12L13 16.5H16.5L14 21" ${stroke(C.bg, 1.8)}/>`,
  },
  "gain-burst": {
    means: "gain burst",
    draw: () =>
      inkLine("M5.5 2.5V9.5M2 6H9", 2.2) +
      `<g transform="translate(14.5,15) scale(0.6) translate(-12,-12)">${inkFill(burst(6))}</g>`,
  },
  "veil-drop": {
    means: "A veil over a falling drop: conditions wear off (#1748).",
    draw: () =>
      inkLine("M3 8C6.5 2.5 17.5 2.5 21 8", 2.2) +
      inkFill("M12 10.5C10 14 9 15.5 9 17.5A3 3 0 0 0 15 17.5C15 15.5 14 14 12 10.5Z"),
  },
  "interrupt-energy-cut": {
    means: "The Mesmer's staples (#1570, #1594): what the skill breaks off, and what it leaves.",
    draw: () =>
      `<g transform="translate(15.5,8.5) scale(0.62) translate(-12,-12)">${glyph("interrupt")}</g>` +
      `<g transform="translate(8,15.5) scale(0.7) translate(-12,-12)">${glyph("energy-cut")}</g>`,
  },
  "interrupt-knockdown": {
    means: "A burst over a figure lying flat for the knockdown.",
    draw: () =>
      `<g transform="translate(9,8.5) scale(0.7) translate(-12,-12)">${glyph("interrupt")}</g>` +
      `<circle cx="5.5" cy="19" r="2.4" fill="${C.ink}"/>` +
      inkLine("M9 19H21M14 19L12 15.5M18 19L20 15.5", 2.4),
  },
  "step-fang": {
    means: "Shadow Step and return (#1847): the mark on top, the way back under it.",
    draw: () => stepAndReturn("fang", C.ink, 2),
  },
  "step-aura": {
    means: "step aura",
    draw: () => stepAndReturn("aura", C.ink, 1.8),
  },
  "step-meld": {
    means: "step meld",
    draw: () => stepAndReturn("meld", C.ink, 1.8),
  },
  "step-haste": {
    means: "step haste",
    draw: () => stepAndReturn("haste", C.ink, 1.8),
  },
  "roots-grasp": {
    means: "Three fingers of earth reaching up out of the ground.",
    draw: () =>
      inkLine("M2 21.5H22", 2.4) +
      inkFill("M3 21L8 7L10.5 21Z") +
      inkFill("M9 21L12 3L15 21Z") +
      inkFill("M13.5 21L16 7L21 21Z"),
  },
  "haste-miss": {
    means: "Speed chevrons with an arrow's dashed trace passing behind, also the status.",
    draw: () =>
      `<path d="M3 21L21 3" ${stroke(C.ink, 1.4)} stroke-dasharray="2.4 2.4"/>` +
      inkLine("M7 7L13 13L7 19M13 7L19 13L13 19", 2.6),
  },
  "adrenal-fast": {
    means: "Rising bars under fast chevrons.",
    draw: () =>
      inkLine("M5 21V16M10 21V12M15 21V8M20 21V4", 3) + inkLine("M3 4L6 7L3 10M7 4L10 7L7 10", 1.8),
  },
  "blink-daze": {
    means: "Beguiling Haze: the step through the shadows, three dazed dots circling above (#1617).",
    draw: () =>
      `<g transform="translate(0,6)">${glyph("blink")}</g>` +
      `<circle cx="5.5" cy="4.5" r="1.8" fill="${C.ink}"/><circle cx="12" cy="2.8" r="1.8" fill="${C.ink}"/><circle cx="18.5" cy="4.5" r="1.8" fill="${C.ink}"/>`,
  },
  "stance-mirror": {
    means:
      "Two stances either side of a dashed axis, one the mirror of the other: a stance copied (#1999).",
    draw: () =>
      `<path d="M12 3V15" ${stroke(C.ink, 1.2)} stroke-dasharray="2 2"/>` +
      `<circle cx="7" cy="5.5" r="2.2" fill="${C.ink}"/><circle cx="17" cy="5.5" r="2.2" fill="${C.ink}"/>` +
      inkLine("M7 9L5.5 11.5L4 14M7 9L9 11.5L9.5 14", 2) +
      inkLine("M17 9L18.5 11.5L20 14M17 9L15 11.5L14.5 14", 2),
  },
  "wand-echo": {
    means: "A four-point spark and its hollow twin: a borrowed skill (#1999).",
    draw: () =>
      inkFill("M8 3.5L10.2 6.8L13.5 9L10.2 11.2L8 14.5L5.8 11.2L2.5 9L5.8 6.8Z") +
      `<path d="M15.5 3.8L17.2 6.3L19.7 8L17.2 9.7L15.5 12.2L13.8 9.7L11.3 8L13.8 6.3Z" ${stroke(C.ink, 1.5)}/>`,
  },
};

export default glyphs;
