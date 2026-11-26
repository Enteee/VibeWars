// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import {
  inkFill,
  inkLine,
  smallFigure,
  nextTrigger,
  holyStar,
  healthGauge,
  glyph,
} from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  heal: {
    means: "heal",
    draw: () => inkFill("M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"),
  },
  "health-above": {
    means: "health above",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M3 12A9 9 0 0 1 21 12Z") +
      inkLine("M8.5 18L12 14.5L15.5 18", 2),
  },
  "heal-drop-low": {
    means: "A heal cross over a gauge under half: healed when the foe is low.",
    draw: () =>
      `<g transform="translate(12,9) scale(0.72) translate(-12,-12)">${glyph("heal-drop")}</g>` +
      healthGauge(0.3),
  },
  "heart-roof": {
    means: "A heart with a plus under a bar: more maximum Health, paid back when it ends (#1645).",
    draw: () =>
      inkLine("M12 21L5 14a4 4 0 0 1 7-4.7 4 4 0 0 1 7 4.7z", 2) +
      inkLine("M12 11.5V17M9.2 14.2H14.8", 2) +
      inkLine("M5 3.5H19", 2.4),
  },
  "heart-plus": {
    means: "A heart with a plus: more maximum Health (#1396).",
    draw: () =>
      inkLine("M12 20L5 13a4 4 0 0 1 7-4.7 4 4 0 0 1 7 4.7z", 2) +
      inkLine("M12 10.5V16M9.2 13.2H14.8", 2),
  },
  "plus-sparks": {
    means: "A plus throwing sparks: each act heals, as the status shows (#1216).",
    draw: () =>
      inkLine("M12 7.5V18.5M6.5 13H17.5", 3) + inkLine("M4.5 4.5L7 7M19.5 4.5L17 7M12 2.5V4", 2.2),
  },
  "plus-gusts": {
    means: "A plus carried on two gusts: health on the wind (#1216).",
    draw: () =>
      inkLine("M15 3.5V12.5M10.5 8H19.5", 3) +
      inkLine("M3 15.5H13.5A2.4 2.4 0 1 0 11.2 12.8M3 20H10.5A2.4 2.4 0 1 1 8.5 22.6", 2),
  },
  "party-heal": {
    means: "Three heads in a row under a plus: the whole team healed (#1216).",
    draw: () =>
      inkLine("M12 2.5V9.5M8.5 6H15.5", 2.6) +
      [5, 12, 19]
        .map(
          (x) =>
            `<circle cx="${String(x)}" cy="14.5" r="2.4" fill="${C.ink}"/>` +
            `<path d="M${String(x - 3.4)} 21.5C${String(x - 3.4)} 18.5 ${String(x - 1.5)} 17.6 ${String(x)} 17.6S${String(x + 3.4)} 18.5 ${String(x + 3.4)} 21.5Z" fill="${C.ink}"/>`,
        )
        .join(""),
  },
  "plus-ripple": {
    means: "A plus with a ripple either side: everyone close by is healed (#1216).",
    draw: () =>
      inkFill("M10.4 6.5h3.2v3.9h3.9v3.2h-3.9v3.9h-3.2v-3.9H6.5v-3.2h3.9z") +
      inkLine("M3.5 8A6 6 0 0 0 3.5 16M20.5 8A6 6 0 0 1 20.5 16", 2),
  },
  "halo-bolt": {
    means:
      "Own-skill modifiers (#1761, #1855): each its own dominant shape. Divine Spirit: a halo over the energy bolt.",
    draw: () =>
      `<ellipse cx="12" cy="3.8" rx="6" ry="2.2" ${stroke(C.ink, 1.9)}/>` +
      inkFill("M13.5 7L6.5 15H11L10 22L18 12.5H13Z"),
  },
  "plus-streaks": {
    means: "Holy Haste: a heavy plus with three speed streaks behind it.",
    draw: () => inkLine("M15 4V20M7.5 12H22.5", 4.4) + inkLine("M1.5 7H6.5M0.5 12H4M1.5 17H6.5", 2),
  },
  "plus-whisper": {
    means: "Monk staples 3 (#1650, #1703): a plus and what it brings, the family of the heals.",
    draw: () =>
      `<g transform="translate(9,12) scale(0.7) translate(-12,-12)">${glyph("heal")}</g>` +
      inkLine("M17.5 8.5C19.5 10.5 19.5 13.5 17.5 15.5M21 6C24 9.5 24 14.5 21 18", 1.8),
  },
  "heal-spark": {
    means: "A plus and a sparkle.",
    draw: () =>
      `<g transform="translate(9,14) scale(0.75) translate(-12,-12)">${glyph("heal")}</g>` +
      inkFill("M18 1.5L19.7 6.3L24.5 8L19.7 9.7L18 14.5L16.3 9.7L11.5 8L16.3 6.3Z"),
  },
  "plus-rays": {
    means: "A plus with rays.",
    draw: () =>
      `<g transform="translate(12,12) scale(0.6) translate(-12,-12)">${glyph("heal")}</g>` +
      inkLine(
        "M12 1.5V4M12 20V22.5M1.5 12H4M20 12H22.5M4.5 4.5L6.3 6.3M17.7 17.7L19.5 19.5M19.5 4.5L17.7 6.3M6.3 17.7L4.5 19.5",
        2,
      ),
  },
  "plus-halo": {
    means: "A plus in a halo.",
    draw: () =>
      `<g transform="translate(12,12) scale(0.55) translate(-12,-12)">${glyph("heal")}</g>` +
      `<circle cx="12" cy="12" r="10" ${stroke(C.ink, 2)}/>`,
  },
  "plus-wings": {
    means: "A plus with four wings.",
    draw: () =>
      `<g transform="translate(12,13) scale(0.5) translate(-12,-12)">${glyph("heal")}</g>` +
      inkFill("M8 12C5 12 3 9.5 1.5 5.5C5 5.5 7.5 7.5 9.5 10Z") +
      inkFill("M16 12C19 12 21 9.5 22.5 5.5C19 5.5 16.5 7.5 14.5 10Z") +
      inkFill("M9.5 14C7 14 4.5 16 3 19.5C6.5 19.5 9 18 11 16Z") +
      inkFill("M14.5 14C17 14 19.5 16 21 19.5C17.5 19.5 15 18 13 16Z"),
  },
  "plus-ring": {
    means: "Soul Bind (#1913): a heal cross cut open at its heart, a ring bound in the gap.",
    draw: () =>
      inkLine("M12 3V8M12 16V21M3 12H8M16 12H21", 5) +
      `<circle cx="12" cy="12" r="3" ${stroke(C.ink, 1.8)}/>`,
  },
  "resurrect-seal": {
    means: "The resurrect figure in a ring: a signet's seal, one use (#1081).",
    draw: () =>
      `<circle cx="10.5" cy="10.5" r="8" ${stroke(C.ink, 2)}/>` + smallFigure(10.5, 10.5, 0.55),
  },
  "resurrect-arrive": {
    means: "The resurrect figure with two chevrons rushing at it: brought to the caster (#1081).",
    draw: () =>
      smallFigure(9, 13, 0.8) + inkLine("M21 3.5L16.5 7L21 10.5M21 8.5L17.5 11L21 13.5", 1.8),
  },
  "resurrect-return": {
    means: "The resurrect figure in a half ring with an arrow: called back (#1081).",
    draw: () =>
      `<path d="M19.5 6.5A9 9 0 1 0 8 19.5" ${stroke(C.ink, 2)}/>` +
      inkFill("M21.5 3V10H14.5Z") +
      smallFigure(12, 12.5, 0.6),
  },
  "resurrect-blood": {
    means: "The resurrect figure with a drop of the caster's blood beside it (#1081).",
    draw: () =>
      smallFigure(9, 12.5, 0.85) +
      inkFill("M18 2.5C18 2.5 14.5 6.5 14.5 9A3.5 3.5 0 0 0 21.5 9C21.5 6.5 18 2.5 18 2.5Z"),
  },
  resurrect: {
    means: "An ankh: life returned, a resurrection (#812).",
    draw: () =>
      `<ellipse cx="12" cy="7.5" rx="4" ry="4.5" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M12 12V21M6 14.5H18", 2.6),
  },
  "heal-other": {
    means: "A head and shoulders with a plus beside it: a heal aimed at another (#996).",
    draw: () =>
      `<circle cx="9" cy="12" r="3.4" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      `<path d="M3 21.5C3 17 5.5 15.5 9 15.5S15 17 15 21.5Z" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      inkLine("M17 3.5V11M13.2 7.2H20.8", 2.6),
  },
  "heal-turn": {
    means: "A plus in a ring of arrow: the blow turned back into a heal (#996).",
    draw: () =>
      `<path d="M18.5 8A8 8 0 1 0 20 12" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M21.5 3.5V10.5H14.5Z") +
      inkLine("M12 8.5V15.5M8.5 12H15.5", 2.4),
  },
  "heal-bolt": {
    means: "A big plus with a small bolt: a great heal, and energy back.",
    draw: () =>
      inkFill("M8 7h4v4h4v4h-4v4H8v-4H4v-4h4z") + inkFill("M19.5 2.5L15.5 8H18.5L17 13L22 6.5H19Z"),
  },
  "heal-clear": {
    means: "A plus beside a struck drop and a struck dashed ring: a condition and a hex taken off.",
    draw: () =>
      inkFill("M6.6 8h3.6v3.6h3.6v3.6H9.6v3.6H6v-3.6H2.4V9.6H6z") +
      `<circle cx="17.5" cy="6.5" r="3.6" ${stroke(C.ink, 1.6)} stroke-dasharray="2.6 2"/>` +
      inkFill(
        "M17.5 12.5C16 14.5 15 15.6 15 16.8A2.5 2.5 0 0 0 20 16.8C20 15.6 19 14.5 17.5 12.5Z",
      ) +
      `<path d="M13.5 21L21.5 11" ${stroke(C.bg, 3)}/>` +
      inkLine("M14 20.5L21 11.5", 1.5),
  },
  "heal-drop": {
    means: "A plus with a drop at its foot: it heals more when there is something to mend.",
    draw: () =>
      inkFill("M9 3h5v5h5v5h-5v5H9v-5H4V8h5z") +
      inkFill(
        "M17.5 14.5C15.5 17 14.5 18.4 14.5 19.8A3 3 0 0 0 20.5 19.8C20.5 18.4 19.5 17 17.5 14.5Z",
      ),
  },
  "plus-trio": {
    means: "Three pluses in a triangle: the whole party is healed.",
    draw: () =>
      [
        [12, 5.5],
        [5.5, 17],
        [18.5, 17],
      ]
        .map(([x, y]) =>
          inkFill(
            `M${String(x - 1.7)} ${String(y - 4.5)}h3.4v2.8h2.8v3.4h-2.8v2.8h-3.4v-2.8h-2.8v-3.4h2.8z`,
          ),
        )
        .join(""),
  },
  "plus-cycle": {
    means: "A plus in a circling arrow: it heals again and again, more when they are busy.",
    draw: () =>
      inkLine("M12 8V16M8 12H16", 2.6) + inkLine("M20 12A8 8 0 1 1 15.5 4.8M15.5 1.5V5H19", 2.2),
  },
  "heart-shield": {
    means: "A heart held in a shield: more Health and armor.",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M12 17L8 12.8a2.4 2.4 0 0 1 4-2.6 2.4 2.4 0 0 1 4 2.6z"),
  },
  "smite-attacking": {
    means:
      "The Monk's smiting skills (#1519, #1584): a four-point star is holy light; a blade in the top left corner is the foe attacking; a signet is its ring and dot; a flat bar is a foe knocked down.",
    draw: () => holyStar(15, 14, 9) + `<g>${nextTrigger.attack()}</g>`,
  },
  "star-below-half": {
    means: "star below half",
    draw: () =>
      `<circle cx="12" cy="14" r="8" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M4 14A8 8 0 0 0 20 14Z") +
      holyStar(6, 5, 4.5),
  },
  "star-beam-flame": {
    means: "star beam flame",
    draw: () =>
      holyStar(12, 6, 6) +
      inkLine("M12 12.5V14M6.5 11L8 13.5M17.5 11L16 13.5", 2) +
      `<g transform="translate(12,18) scale(0.55) translate(-12,-12)">${glyph("flame")}</g>`,
  },
  "plus-fragile": {
    means: "Monk staples 6 (#1767). A plus in a broken ring: a heal that a blow stops (#1748).",
    draw: () =>
      `<path d="M12 3.5A8.5 8.5 0 0 1 20.5 12M18 18A8.5 8.5 0 0 1 6 18M3.5 12A8.5 8.5 0 0 1 8 4.6" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M12 7.5V16.5M7.5 12H16.5", 3),
  },
  "gift-plus": {
    means: "A wrapped gift topped with a plus: a great heal given away (#1748).",
    draw: () =>
      `<rect x="4" y="12" width="16" height="9" rx="1" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M12 12V21M4 16H20", 2) +
      inkLine("M12 2.5V8.5M9 5.5H15", 2.4),
  },
  "star-prone": {
    means: "star prone",
    draw: () =>
      holyStar(13, 8, 7.5) +
      `<circle cx="5.5" cy="18.5" r="2.4" fill="${C.ink}"/>` +
      inkLine("M9 18.5H20.5", 3),
  },
  "star-return": {
    means: "A holy star and an arrow turned back on itself: the blow returns (#1754, #1784).",
    draw: () =>
      holyStar(16, 7.5, 6.5) +
      inkLine("M13 14.5H7.5a3.2 3.2 0 0 0 0 6.4H18", 2) +
      inkFill("M22 21L17.5 18.2V23.8Z"),
  },
  "star-aura": {
    means: "A holy star inside a dashed ring: the aura that burns adjacent foes (#1754, #1784).",
    draw: () =>
      holyStar(12, 12, 6) +
      `<circle cx="12" cy="12" r="10" ${stroke(C.ink, 2)} stroke-dasharray="3 3"/>`,
  },
  "halo-heart-bar": {
    means:
      "Ally threshold mechanics (#1789, #1817): a Health bar with the line that, once crossed, answers.",
    draw: () =>
      `<ellipse cx="12" cy="3.6" rx="5" ry="1.8" ${stroke(C.ink, 1.8)}/>` +
      `<path d="M12 16s-5.5-3.4-5.5-7a3 3 0 0 1 5.5-1.7A3 3 0 0 1 17.5 9c0 3.6-5.5 7-5.5 7z" ${stroke(C.ink, 1.8)}/>` +
      `<rect x="3" y="18.5" width="18" height="3.5" rx="0.8" ${stroke(C.ink, 1.8)}/>` +
      `<path d="M20 1.7L21.06 4.44L23.8 5.5L21.06 6.56L20 9.3L18.94 6.56L16.2 5.5L18.94 4.44Z" fill="${C.ink}"/>`,
  },
  "heart-bar": {
    means: "heart bar",
    draw: () =>
      `<path d="M12 16s-5.5-3.4-5.5-7a3 3 0 0 1 5.5-1.7A3 3 0 0 1 17.5 9c0 3.6-5.5 7-5.5 7z" transform="translate(-3,0)" ${stroke(C.ink, 1.8)}/>` +
      `<circle cx="19.5" cy="5.5" r="3.2" ${stroke(C.ink, 1.5)}/><circle cx="19.5" cy="5.5" r="1.1" fill="${C.ink}"/>` +
      `<rect x="3" y="18.5" width="18" height="3.5" rx="0.8" ${stroke(C.ink, 1.8)}/>` +
      `<rect x="3" y="18.5" width="9" height="3.5" rx="0.8" fill="${C.ink}"/>`,
  },
  "heart-sword": {
    means: "A sword with a heart on its hilt: more Health while it is armed.",
    draw: () =>
      inkLine("M7 17L20 4", 2.6) +
      inkLine("M4 14L10 20", 2.6) +
      `<path d="M7 11s-4-2.4-4-5A2.2 2.2 0 0 1 7 4.7 2.2 2.2 0 0 1 11 6c0 2.6-4 5-4 5z" fill="${C.ink}" transform="translate(-0.5,0)"/>`,
  },
};

export default glyphs;
