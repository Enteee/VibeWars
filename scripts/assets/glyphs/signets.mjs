// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import {
  inkFill,
  inkLine,
  nextTrigger,
  ringDot,
  takeSrc,
  takeCopy,
  takeMark,
  healthGauge,
  mantra,
  RIDER,
  NOT,
  riderOn,
  glyph,
} from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "signet-agony": {
    means:
      "A ring ticked outward round a drop: the signet's pain reaches those near, the caster bleeds.",
    draw: () =>
      `<circle cx="12" cy="12" r="6.5" ${stroke(C.ink, 2)}/>` +
      inkLine(
        "M12 2V4.5M12 19.5V22M2 12H4.5M19.5 12H22M5 5L6.8 6.8M17.2 17.2L19 19M19 5L17.2 6.8M6.8 17.2L5 19",
        2,
      ) +
      inkFill("M12 7.8c1.5 2.2 2.6 3.5 2.6 5a2.6 2.6 0 0 1-5.2 0c0-1.5 1.1-2.8 2.6-5z"),
  },
  "signet-low": {
    means: "A signet ring over a gauge under half: Health and Energy from a low foe.",
    draw: () =>
      `<g transform="translate(12,9) scale(0.7) translate(-12,-12)">${glyph("drop-to-signet")}</g>` +
      healthGauge(0.3),
  },
  "glyph-sealed": {
    means:
      "Wells, glyphs and attribute hexes (#1783). A bolt sealed in a ring: the next spell cannot be interrupted.",
    draw: () =>
      `<circle cx="12" cy="12" r="10" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M14 4.5L8 12.5h4l-2 7 6.5-9h-4z"),
  },
  "glyph-slow": {
    means: "A bolt and an hourglass: cast now, recharge later.",
    draw: () =>
      inkFill("M10 2.5L3.5 12.5h4.5l-2 8.500 7-11h-4.500z") +
      inkLine("M15.5 3.5H22M15.5 20.5H22M16.5 3.5L21 12L16.5 20.5M21 3.5L16.5 12L21 20.5", 2),
  },
  "glyph-renew": {
    means: "A bolt inside a circling arrow: the spell comes back at once.",
    draw: () =>
      `<path d="M20 7.500A9.500 9.500 0 1 0 21.500 13" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M23 1.500V9H15.500Z") +
      inkFill("M13 6L8.500 12.500H12l-1.500 5.500 5-7h-3.500Z"),
  },
  "glyph-drain": {
    means: "A bolt over a drained bar: cast now, all Energy gone.",
    draw: () =>
      inkFill("M13.500 2L7 12h4.500L9.500 17l7-9.500h-4.500Z") +
      `<rect x="2.500" y="18.500" width="19" height="3.500" rx="1" ${stroke(C.ink, 1.8)}/>` +
      inkFill("M3.500 19.500H6.500V21H3.500Z"),
  },
  "signet-shadow": {
    means: "Signet of Shadows: a signet ring with an eye shut in it, blindness raises the damage.",
    draw: () =>
      `<circle cx="12" cy="12" r="9.5" ${stroke(C.ink, 2.2)}/>` +
      `<g transform="translate(12,12) scale(0.62) translate(-12,-12)">${glyph("eye-slash")}</g>`,
  },
  "signet-limp": {
    means: "A signet's ring and dot with a crack through the corner: the signet that cripples.",
    draw: () => ringDot(10, 14, 7) + inkLine("M20 2L16.5 6L20 9L16.5 13", 2.2),
  },
  "echo-spell": {
    means: "A spell, and arcs of it carried on: Arcane Echo copies the next spell (#1136).",
    draw: () =>
      `<circle cx="6" cy="11" r="3.4" fill="${C.ink}"/>` +
      inkLine("M10.5 7A5.5 5.5 0 0 1 10.5 15M14 4A9 9 0 0 1 14 18", 2.2),
  },
  "echo-skill": {
    means: "A plain skill square, and three arcs: Echo copies the next skill of any type (#1136).",
    draw: () =>
      `<rect x="3" y="8.5" width="7" height="7" rx="1" fill="${C.ink}"/>` +
      inkLine(
        "M12.5 8A5 5 0 0 1 12.5 16M16 5.5A8.5 8.5 0 0 1 16 18.5M19.5 3.5A12 12 0 0 1 19.5 20.5",
        2,
      ),
  },
  "signet-plus": {
    means: "A signet with a ringed plus.",
    draw: () =>
      riderOn(
        `<circle cx="12" cy="14" r="6" ${stroke(C.ink, 2.5)}/><path d="M12 2.5l3.5 3.5-3.5 3.5-3.5-3.5z" fill="${C.ink}"/>`,
        RIDER.plus,
      ),
  },
  "signet-plus-bare": {
    means: "signet plus bare",
    draw: () => riderOn(ringDot(10, 11, 7) + inkLine("M19.5 2V8M16.5 5H22.5", 2.2), NOT.ring),
  },
  scroll: {
    means:
      "Mechanics skills (#1940). Scribe's Insight (#1913): a page of lines, the signets it reads.",
    draw: () =>
      `<path fill-rule="evenodd" fill="${C.ink}" stroke="${C.bg}" stroke-width="1" stroke-linejoin="round" d="M5 3H17Q18 3 18 4V15Q18 17 16 17H7Q5 17 5 15ZM7.5 6.5H15.5V8H7.5ZM7.5 10H15.5V11.5H7.5Z"/>` +
      inkLine("M5 17Q5 21 9 21H15", 2),
  },
  "signet-glow": {
    means:
      "A signet ring round a bolt with a small flame in the corner: Energy from a burning foe.",
    draw: () =>
      `<circle cx="10" cy="14" r="7.5" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M11.5 8.5L7 15H10.5L9 19.5L13.5 13H10Z") +
      inkFill(
        "M19.5 1.5C21.5 3.5 22.5 5 22.5 6.8a3 3 0 0 1-6 0C16.5 5.5 17.3 4.5 18.2 3.7C18.4 4.8 18.9 5.3 19.2 5.3C19.8 4.2 19.8 3 19.5 1.5Z",
      ),
  },
  "signet-blade": {
    means: "A signet ring and dot with a blade in the corner: a signet for the attacks.",
    draw: () => ringDot(10, 14, 7) + inkLine("M14 10L22 2", 2.2) + inkLine("M14.5 5.5L18.5 9.5", 2),
  },
  "signet-cure": {
    means: "A signet ring and dot with a struck-through drop: a signet that cures.",
    draw: () =>
      ringDot(10, 14, 7) +
      inkFill("M19 2c1.6 2.3 2.8 3.4 2.8 5a2.8 2.8 0 0 1-5.6 0c0-1.6 1.2-2.7 2.8-5z") +
      inkLine("M15.5 10.5L22.5 2.5", 1.6),
  },
  "signet-attacking": {
    means: "signet attacking",
    draw: () => ringDot(15, 9, 6.5) + inkLine("M4 21H20", 2.8) + `<g>${nextTrigger.attack()}</g>`,
  },
  "signet-energy": {
    means: "signet energy",
    draw: () =>
      ringDot(15, 9, 6.5) +
      `<g transform="translate(14,18) scale(0.55) translate(-12,-12)">${glyph("energy")}</g>` +
      `<g>${nextTrigger.attack()}</g>`,
  },
  "signet-quake": {
    means: "signet quake",
    draw: () => ringDot(12, 9, 6.5) + inkLine("M2 9H3.5M20.5 9H22M4 21H20", 2.4),
  },
  "signet-strip": {
    means:
      "A signet seal crossed out beside a hex ring: one hex and one condition removed (#1748).",
    draw: () =>
      ringDot(9, 14, 6) +
      `<circle cx="17" cy="7" r="4.5" ${stroke(C.ink, 2)} stroke-dasharray="3 2.4"/>` +
      inkLine("M13.5 3.5L20.5 10.5", 2.2),
  },
  "skills-off": {
    means: "Four squares struck through for every skill disabled.",
    draw: () =>
      inkFill("M3 3H11V11H3ZM13 3H21V11H13ZM3 13H11V21H3ZM13 13H21V21H13Z") +
      `<path d="M2 22L22 2" stroke="${C.bg}" stroke-width="6" stroke-linecap="round"/>` +
      inkLine("M2 22L22 2", 2.6),
  },
  "take-ench-in": {
    means:
      "Taken from the target: its enchantment ring or hex ring top right, a curved arrow, the copy bottom left (#1946).",
    draw: () => takeMark(takeSrc(false, false), takeCopy(false, true)),
  },
  "take-ench-rev": {
    means: "take ench rev",
    draw: () => takeMark(takeSrc(false, true), takeCopy(false, false)),
  },
  "take-hex-in": {
    means: "take hex in",
    draw: () => takeMark(takeSrc(true, false), takeCopy(true, true)),
  },
  "take-hex-rev": {
    means: "take hex rev",
    draw: () => takeMark(takeSrc(true, true), takeCopy(true, false)),
  },
  "take-skill": {
    means: "A skill square taken: one square, or a stack of two (Larceny reaches further).",
    draw: () =>
      takeMark(
        `<rect x="13" y="3" width="8" height="8" rx="1" fill="${C.ink}"/>`,
        `<rect x="3" y="14" width="7" height="7" rx="1" fill="${C.ink}"/>`,
      ),
  },
  "take-skills": {
    means: "take skills",
    draw: () =>
      takeMark(
        `<rect x="15" y="1.5" width="7" height="4.5" rx="1" fill="${C.ink}"/><rect x="15" y="8" width="7" height="4.5" rx="1" fill="${C.ink}"/>`,
        `<rect x="3" y="14" width="7" height="7" rx="1" fill="${C.ink}"/>`,
      ),
  },
  "glyph-power-up": {
    means:
      'Attributes raised (#1941, #1947). The mark for "raised" is three rising bars, the counterpart of the wilted bars of #1946; the glyphs ring a picture instead. Glyph of Elemental Power: a flame in the glyph ring, the rising bars beside it.',
    draw: () =>
      `<circle cx="8.5" cy="12" r="6.5" ${stroke(C.ink, 2)}/>` +
      inkFill(
        "M8.5 6.5C9.7 8.5 11.5 9.7 11.5 12.5A3 3 0 0 1 5.5 12.5C5.5 11 6.7 10.5 7 8.8C7.6 9.5 7.9 10 8.1 10.5C8.5 9.5 8.6 8 8.5 6.5Z",
      ) +
      inkFill("M16 20V16H18.2V20ZM18.9 20V11.5H21.1V20ZM21.8 20V7H24V20Z"),
  },
  "glyph-energy-up": {
    means: "Glyph of Energy: a bolt in the glyph ring, the rising bars beside it.",
    draw: () =>
      `<circle cx="8.5" cy="12" r="6.5" ${stroke(C.ink, 2)}/>` +
      inkFill("M9.5 6.5L5.5 12.8H8.3L7.3 17.5L11.8 11H9Z") +
      inkFill("M16 20V16H18.2V20ZM18.9 20V11.5H21.1V20ZM21.8 20V7H24V20Z"),
  },
  "mantra-burst-struck": {
    means: "Mesmer mantras (#1981): the frame, and what the mantra holds against.",
    draw: () => mantra(glyph("interrupt") + inkLine("M3 21L21 3", 3.2)),
  },
  "mantra-shield": {
    means: "mantra shield",
    draw: () =>
      mantra(
        `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 3.4)}/>`,
      ),
  },
  "mantra-rock": {
    means: "mantra rock",
    draw: () => mantra(glyph("rock")),
  },
  "mantra-flame": {
    means: "mantra flame",
    draw: () => mantra(glyph("flame")),
  },
  "mantra-frost": {
    means: "mantra frost",
    draw: () => mantra(glyph("snowflake")),
  },
  "mantra-lightning": {
    means: "mantra lightning",
    draw: () => mantra(glyph("lightning")),
  },
};

export default glyphs;
