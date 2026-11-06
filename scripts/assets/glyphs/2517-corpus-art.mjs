// Glyphs (#2517): the stand-ins of #2501, #2502 and #2513.

import { C, stroke } from "../icon-kit.mjs";
import { DROP, holyStar, inkFill, inkLine, punisher, spiritPost, wasUrn } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "bolt-speed-lines": {
    means:
      "Storm's Embrace: speed lines streaming behind a lightning bolt: fast on foot, renewed by the storm.",
    draw: () =>
      inkFill("M17.500 2.500L9 13H13.500L12 21.500L21 10H16.500Z") +
      inkLine("M2.500 7H8M3 12H8M4 17H9", 2),
  },
  "hex-drop-loop": {
    means:
      "Recurring Insecurity: a drop under a looping arrow in the hex ring: the damage comes back as it ends.",
    draw: () =>
      punisher(
        `<g transform="translate(12,15) scale(0.62) translate(-12,-12)">${DROP}</g>` +
          inkLine("M5.500 9a7 7 0 0 1 13 0M18.500 9l-.5-3.500M18.500 9l-3.500.500", 2),
      ),
  },
  "post-blade-plus": {
    means: "Spirit's Strength: the spirit post beside a sword: its blows land harder.",
    draw: () =>
      spiritPost() +
      inkLine("M12.500 20L21 11.500M16.500 9.500L21.500 14.500M12 21l1.500-1.500", 2.2),
  },
  "urn-minus": {
    means: "Attuned was Songkai: the urn of ashes with a minus in it: spells cost less.",
    draw: () => wasUrn(inkLine("M9 15.500H15", 2.6)),
  },
  "urn-circle-arrow": {
    means:
      "Anguished was Lingwah: the urn of ashes with a circling arrow in it: hexes come back as it drops.",
    draw: () => wasUrn(inkLine("M15 14.500a3.200 3.200 0 1 0-.800 2.600M15.500 12v3H12.500", 1.8)),
  },
  "bundle-minus": {
    means: "Renewing Memories: a held bundle beside a minus: it costs less while it is held.",
    draw: () =>
      inkFill("M3.500 8H14.500V20H3.500Z") +
      `<path d="M9 8V20M3.500 14H14.500" ${stroke(C.bg, 1.6)}/>` +
      inkLine("M16 5.500H22", 2),
  },
  "star-halo-vow": {
    means: "Vow of Piety: a holy star under a broken halo: a vow that keeps renewing.",
    draw: () =>
      holyStar(12, 13, 7.5) +
      inkLine(
        "M5.500 7.500A8 8 0 0 1 18.500 7.500M18.500 7.500l-3.500-.200M18.500 7.500l-.2 3.500",
        1.8,
      ),
  },
  "ring-ticks": {
    means:
      "Signet of Mystic Speed: a signet ring with three ticks over it: each use is an instant enchantment.",
    draw: () =>
      `<circle cx="12" cy="15" r="5.500" ${stroke(C.ink, 2.2)}/><circle cx="12" cy="9.500" r="2" fill="${C.ink}"/>` +
      inkLine("M5 5.500L6.500 7.500M12 2.500V5M19 5.500L17.500 7.500", 2),
  },
  "hex-blade-down": {
    means:
      "Siphon Strength: a blade pointing down beside a star in the hex ring: weaker blows, their crits yours.",
    draw: () => punisher(inkLine("M8 3.500V15M5 12l3 5 3-5", 2.4) + holyStar(16.5, 9, 5)),
  },
  "hex-burden-sack": {
    means:
      "Shadowy Burden: a heavy sack over slowing chevrons in the hex ring: slowed, and cracked while alone.",
    draw: () =>
      punisher(
        inkFill("M8.500 3H15.500L14.500 6Q19 9 19 13A7 7 0 0 1 5 13Q5 9 9.500 6Z") +
          inkLine("M6 20.500L8.500 22L11 20.500M13 20.500L15.500 22L18 20.500", 1.4),
      ),
  },
  "boot-speed": {
    means:
      "Soldier's Speed: a marching boot with speed lines behind it: fast, faster under a chant or shout.",
    draw: () =>
      inkFill("M10 3H16V11L21 14.500V20H8V16L10 14.500Z") +
      inkLine("M2.500 8H7M2.500 12H7M2.500 16H6", 2.2),
  },
  "half-disc-speed": {
    means: "Deadly Haste: a half disc with speed lines behind it: half-ranged spells come faster.",
    draw: () =>
      inkFill("M14 4.500A7.500 7.500 0 0 1 14 19.500Z") +
      inkLine("M2.500 8H10M2.500 12H10M2.500 16H10", 2.2),
  },
  "bolt-hourglass": {
    means:
      "Auspicious Incantation: a bolt beside an hourglass: Energy now, a longer recharge after.",
    draw: () =>
      inkFill("M8 2.500L3 12H7L5.500 21.500L12 10H8Z") +
      inkFill("M13.500 3.500H21.500L17.500 12L21.500 20.500H13.500L17.500 12Z"),
  },
  "crown-chevron": {
    means: "Symbols of Inspiration: a crown over a chevron: elite skills cast with Fast Casting.",
    draw: () =>
      inkFill("M3 14L5 5L9.500 9L12 3L14.500 9L19 5L21 14Z") + inkLine("M6 19L12 16L18 19", 2.4),
  },
  "post-bolt-return": {
    means:
      "Reclaim Essence: the spirit post with an energy bolt coming back to it: its Energy is taken back.",
    draw: () =>
      spiritPost() +
      inkFill("M18 2.500L12.500 11H16.500L15 18.500L21.500 9H17.500Z") +
      inkLine("M12 21H21", 2),
  },
  "scythe-dust": {
    means:
      "Ebon Dust Aura: a scythe over grains of black dust: the swing carries earth, the foe goes blind.",
    draw: () =>
      inkLine("M6 21L15 4C19 6 21 10 20 15", 2.6) +
      inkLine("M12.500 5L8 8", 2.2) +
      `<circle cx="5" cy="7" r="1.800" fill="${C.ink}"/><circle cx="9" cy="3.500" r="1.500" fill="${C.ink}"/><circle cx="19" cy="20" r="1.800" fill="${C.ink}"/>`,
  },
};

export default glyphs;
