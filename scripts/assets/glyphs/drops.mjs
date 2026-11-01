// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import {
  inkFill,
  inkLine,
  smallSkull,
  DROP,
  sacrifice,
  healthGauge,
  glyph,
} from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "drop-siphon": {
    means: "A hollow drop drained into a filled one: health siphoned to the caster.",
    draw: () =>
      inkLine("M8 3.5c2.2 3.2 3.6 5 3.6 7.3a3.6 3.6 0 0 1-7.2 0c0-2.3 1.4-4.1 3.6-7.3z", 2) +
      inkFill("M16.5 12c1.8 2.6 3 4.1 3 6a3 3 0 0 1-6 0c0-1.9 1.2-3.4 3-6z") +
      inkLine("M11.5 15L13 16.5", 2),
  },
  "drop-sac-bolt": {
    means:
      "Necromancer staples 3 (#1651): a base glyph over a health gauge (full past half: above half; under it: below half), or a snowflake with its rider. A drop given up with a bolt leaving it: Health spent for shadow damage.",
    draw: () =>
      inkFill("M8 9C6 12 5 13.5 5 15.5a3.2 3.2 0 0 0 6.4 0C11.4 13.5 10 12 8 9Z") +
      inkLine("M13 4L16.5 4L14 9.5L20 8.5L11.5 18", 2),
  },
  "drop-arrow-high": {
    means: "A drop drawn off sideways over a gauge past half: Health stolen from a healthy foe.",
    draw: () =>
      `<g transform="translate(12,9) scale(0.7) translate(-12,-12)">${glyph("drop-arrow")}</g>` +
      healthGauge(0.7),
  },
  "bleed-horror": {
    means: "A skull over three drops: the shambling horror bleeds what it hits (#1860).",
    draw: () =>
      smallSkull(12, 9, 0.8) +
      inkFill("M6.5 17.5C8 19.5 8 21 6.5 21.8C5 21 5 19.5 6.5 17.5Z") +
      inkFill("M12 18C13.6 20.2 13.6 22 12 22.8C10.4 22 10.4 20.2 12 18Z") +
      inkFill("M17.5 17.5C19 19.5 19 21 17.5 21.8C16 21 16 19.5 17.5 17.5Z"),
  },
  "drop-bolt": {
    means: "A drop with a bolt through it: the condition is smitten (#1216).",
    draw: () =>
      `<path d="M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z" ${stroke(C.ink, 2)}/>` +
      inkFill("M14 8.5L9.5 14H12.6L10.6 19L15.4 12.8H12.4Z"),
  },
  "drop-ward": {
    means:
      "A drop struck through inside a rounded square, the enchantment's plate: the drop goes, the enchantment pays (#1216).",
    draw: () =>
      `<rect x="2.5" y="2.5" width="19" height="19" rx="5" ${stroke(C.ink, 2)}/>` +
      `<path d="M12 6.5C12 6.5 7.8 12 7.8 14.5A4.2 4.2 0 0 0 16.2 14.5C16.2 12 12 6.5 12 6.5Z" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M6 6L18 18", 2.2),
  },
  "drop-pair": {
    means: "Two small drops, each struck: two conditions go (#1216).",
    draw: () =>
      [
        [-0.85, 0.9],
        [8.15, 5.9],
      ]
        .map(
          ([x, y]) =>
            `<g transform="translate(${String(x)},${String(y)}) scale(0.7)">` +
            `<path d="M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z" ${stroke(C.ink, 2.6)}/>` +
            inkLine("M4 4L20 20", 3) +
            "</g>",
        )
        .join(""),
  },
  "drop-arrow": {
    means: "A drop with an arrow leaving it: health drawn off, as the status shows (#1217).",
    draw: () =>
      `<path d="M9 5c2.4 3.6 4.2 5.8 4.2 8.5a4.2 4.2 0 0 1-8.4 0C4.8 10.8 6.6 8.6 9 5z" fill="${C.ink}"/>` +
      inkLine("M15 12.5H21M18.5 9.5L21.5 12.5L18.5 15.5", 2.2),
  },
  "drop-touch": {
    means: "A big drop with a plus cut out of it: health taken by a touch (#1348).",
    draw: () =>
      inkFill("M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z") +
      `<path d="M12 12.5V19M8.8 15.8H15.2" ${stroke(C.bg, 2.2)}/>`,
  },
  "drop-trio": {
    means: "Three small drops: life drawn from up to three foes (#1348).",
    draw: () =>
      [
        [4.2, 0.2],
        [-0.2, 10.2],
        [8.8, 10.2],
      ]
        .map(
          ([x, y]) =>
            `<g transform="translate(${String(x)},${String(y)}) scale(0.58)">${inkFill("M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z")}</g>`,
        )
        .join(""),
  },
  "drop-half": {
    means: "A drop half full: a strike that drinks above half health (#1348).",
    draw: () =>
      `<path d="M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z" ${stroke(C.ink, 2.6)}/>` +
      inkFill("M5.5 12.5H18.5V15A6.5 6.5 0 0 1 5.5 15Z"),
  },
  "drop-weak": {
    means: "A drop with a heavy arrow pointing down: a foe weakened as it is drained (#1348).",
    draw: () =>
      inkFill("M8.5 4C8.5 4 3 10.5 3 14.2A5.5 5.5 0 0 0 14 14.2C14 10.5 8.5 4 8.5 4Z") +
      inkLine("M19 4V14M15 11L19 15.5L23 11", 2.6),
  },
  "drop-barbs": {
    means: "A small drop ringed by four barbs: health paid, the foe bleeds (#1348).",
    draw: () =>
      `<g transform="translate(12,12.5) scale(0.7) translate(-12,-11.5)">${inkFill("M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z")}</g>` +
      inkFill("M12 0.5L15.5 6H8.5ZM12 24L15.5 18.5H8.5ZM0.5 12L6 8.5V15.5ZM23.5 12L18 8.5V15.5Z"),
  },
  "drop-energy": {
    means: "A drop feeding a bolt: health sacrificed for energy (#1348).",
    draw: () =>
      `<g transform="translate(-1.2,2) scale(0.7)">${inkFill("M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z")}</g>` +
      inkFill("M18 2.5L11.5 13H16L14.5 21.5L22.5 9.5H17.5Z"),
  },
  "drop-struck": {
    means: "drop struck",
    draw: () =>
      inkFill("M12 2.5C12 2.5 4.5 12 4.5 16A7.5 7.5 0 0 0 19.5 16C19.5 12 12 2.5 12 2.5Z") +
      `<path d="M3.5 21.5L20.5 6" ${stroke(C.bg, 5.4)}/>` +
      inkLine("M3.5 21.5L20.5 6", 2.4),
  },
  "drops-purge": {
    means: "Three drops struck through.",
    draw: () =>
      [0, 7, 14]
        .map(
          (x) =>
            `<g transform="translate(${String(x)},0)">${inkFill("M5 4.5C3 7.5 1 9 1 11.5A4 4 0 0 0 9 11.5C9 9 7 7.5 5 4.5Z")}</g>`,
        )
        .join("") + inkLine("M2 21L22 3", 2.4),
  },
  "drop-mend": {
    means: "Mend Ailment: one drop struck off, two still standing, and a plus over them (#1703).",
    draw: () =>
      `<path d="M6 8C4 11 2 12.5 2 15A4 4 0 0 0 10 15C10 12.5 8 11 6 8Z" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M2 21L10 9", 2.2) +
      inkFill(
        "M16 11C14.5 13.2 13.5 14.4 13.5 15.8A2.5 2.5 0 0 0 18.5 15.8C18.5 14.4 17.5 13.2 16 11Z",
      ) +
      inkFill(
        "M20.5 15C19.3 16.6 18.8 17.4 18.8 18.4A1.7 1.7 0 0 0 22.2 18.4C22.2 17.4 21.7 16.6 20.5 15Z",
      ) +
      inkLine("M16 2.5V8.5M13 5.5H19", 2.4),
  },
  "tear-fall": {
    means: "A tear over a falling line, a dashed ring around: the hex that drains (#1319).",
    draw: () =>
      `<circle cx="12" cy="12" r="9.5" ${stroke(C.ink, 1.8)} stroke-dasharray="4.4 3.4"/>` +
      `<path d="M12 5.5c-2.4 3-4 5-4 7a4 4 0 0 0 8 0c0-2-1.6-4-4-7z" fill="${C.ink}"/>` +
      inkLine("M7.5 19L12 17.5L16.5 19", 1.8),
  },
  "drop-cure-run": {
    means: "A drop struck through with a running chevron: conditions cleansed, a burst of speed.",
    draw: () =>
      `<path d="M9.5 3C9.5 3 4 9.5 4 13.5A5.5 5.5 0 0 0 15 13.5C15 9.5 9.5 3 9.5 3Z" ${stroke(C.ink, 2)}/>` +
      inkLine("M3 3L16 17", 2.2) +
      inkLine("M15 15L19 19L15 23M19.5 15L23 19L19.5 23", 1.8),
  },
  "drop-spread": {
    means:
      "Epidemic is no hex: a drop with four drops spread out from it, a condition copied to the foes near.",
    draw: () =>
      inkFill("M12 7C10 10 8.8 11.4 8.8 13.4A3.2 3.2 0 0 0 15.2 13.4C15.2 11.4 14 10 12 7Z") +
      inkFill("M4.5 2C2.9 4.2 2.1 5 2.1 5.8A2.4 2.4 0 0 0 6.9 5.8C6.9 5 6.1 4.2 4.5 2Z") +
      inkFill("M19.5 2C17.9 4.2 17.1 5 17.1 5.8A2.4 2.4 0 0 0 21.9 5.8C21.9 5 21.1 4.2 19.5 2Z") +
      inkFill(
        "M4.5 16.5C2.9 18.7 2.1 19.5 2.1 20.3A2.4 2.4 0 0 0 6.9 20.3C6.9 19.5 6.1 18.7 4.5 16.5Z",
      ) +
      inkFill(
        "M19.5 16.5C17.9 18.7 17.1 19.5 17.1 20.3A2.4 2.4 0 0 0 21.9 20.3C21.9 19.5 21.1 18.7 19.5 16.5Z",
      ) +
      inkLine("M9 11L6.5 8.5M15 11L17.5 8.5M9 15.5L6.5 17M15 15.5L17.5 17", 1.5),
  },
  "drop-run": {
    means: "A drop with chevrons beside it: the poison bites for as long as the foe runs (#1262).",
    draw: () =>
      inkFill("M9 3C9 3 3.5 9.5 3.5 13A5.5 5.5 0 0 0 14.5 13C14.5 9.5 9 3 9 3Z") +
      inkLine("M15.5 3.5L19.5 7.5L15.5 11.5", 2.4),
  },
  "sac-energy": {
    means:
      "The Necromancer's sacrifice skills (#1572): a drop given up at the bottom left, its payoff at the top right.",
    draw: () => sacrifice(glyph("energy")),
  },
  "sac-blade": {
    means: "sac blade",
    draw: () => sacrifice(glyph("sword")),
  },
  "drop-to-signet": {
    means: "Plague Signet: a drop leaving for a signet ring and dot (#1572).",
    draw: () =>
      `<g transform="translate(7,12) scale(0.62) translate(-12,-12)">${DROP}</g>` +
      inkLine("M12.5 12H15.5M13.5 9.5L16 12L13.5 14.5", 2) +
      `<circle cx="19" cy="12" r="3.6" ${stroke(C.ink, 2)}/><circle cx="19" cy="12" r="1.2" fill="${C.ink}"/>`,
  },
  "drop-plus": {
    means: "A drop of blood with a plus cut out of it: Health back after the bleeding.",
    draw: () =>
      inkFill("M12 2C12 2 5 10.5 5 15.5A7 7 0 0 0 19 15.5C19 10.5 12 2 12 2Z") +
      `<path d="M12 12V19M8.5 15.5H15.5" ${stroke(C.bg, 2.4)}/>`,
  },
  "drop-skull": {
    means: "A drop flowing into a skull: a condition passed to the minion (#1946).",
    draw: () =>
      inkFill("M5.5 6C9 10 9 13 5.5 15.5C2 13 2 10 5.5 6Z") +
      inkLine("M4 20H12M9.5 17.5L12 20L9.5 22.5", 1.8) +
      smallSkull(17, 14, 0.8),
  },
  "drop-shock": {
    means: "Signet of Toxic Shock: a drop with a bolt cut out of it (#1617).",
    draw: () =>
      inkFill("M12 2.5C12 2.5 4.5 11 4.5 15.5A7.5 7.5 0 0 0 19.5 15.5C19.5 11 12 2.5 12 2.5Z") +
      `<path d="M13.5 9.5L9.5 15H14L10.5 20.5" ${stroke(C.bg, 2.2)}/>`,
  },
};

export default glyphs;
