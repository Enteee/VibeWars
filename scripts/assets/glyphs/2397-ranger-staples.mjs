// Glyphs (#2397): the stand-ins of #2317 and #2321.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "drop-burst-down": {
    means:
      "Rising Bile: a solid drop over three bursting rays: bile that bursts on those near as it ends.",
    draw: () =>
      inkFill(
        "M12 2C15.500 7 17.500 9 17.500 12A5.500 5.500 0 0 1 6.500 12C6.500 9 8.500 7 12 2Z",
      ) + inkLine("M12 19V23M5 17L2.500 21M19 17L21.500 21", 2.2),
  },
  "scales-beam": {
    means:
      "Grenth's Balance: a beam scale with two solid pans: what one side loses the other gains.",
    draw: () =>
      inkLine("M3 6H21M12 3V21M7 21H17", 2.2) +
      inkFill("M5 7L1.500 15H8.500ZM19 7L15.500 15H22.500Z"),
  },
  "cloud-choke": {
    means: "Choking Gas: a solid drifting cloud with a cross cut in it: spells choked off.",
    draw: () =>
      inkFill("M6 20A4.500 4.500 0 0 1 6 11A6 6 0 0 1 18 10A5 5 0 0 1 18 20Z") +
      `<path d="M9.500 12.500L14.500 17.500M14.500 12.500L9.500 17.500" ${stroke(C.bg, 2)}/>`,
  },
  "shield-leaf": {
    means: "Dryder's Defenses: a solid shield with a leaf cut into it: the forest's guard.",
    draw: () =>
      inkFill("M12 2L3 5V12C3 17 8 20 12 22C16 20 21 17 21 12V5Z") +
      `<path d="M12 18C7 16 8 10 12 7C16 10 17 16 12 18Z" fill="${C.bg}"/>` +
      `<path d="M12 18V10" ${stroke(C.ink, 1.4)}/>`,
  },
  "fountain-arcs": {
    means:
      "Healing Spring: water arcing out of a spout over a basin: a spring that heals the party.",
    draw: () =>
      inkLine("M12 20V11M12 11C12 4 5 3 3.500 9M12 11C12 4 19 3 20.500 9", 2.2) +
      inkFill("M5 20H19V23H5Z"),
  },
  "noose-loop": {
    means:
      "Snare: a rope loop pulled tight at a knot, tied off at the ground: a trap that holds foes.",
    draw: () =>
      inkLine("M12 15A6 6 0 1 1 12 3A6 6 0 0 1 12 15", 2.4) +
      inkFill("M9.500 14H14.500V17H9.500Z") +
      inkLine("M12 17L8 22M12 17L16 22", 2.2),
  },
  "claws-rake": {
    means: "Bestial Fury: three curved claw gashes: a pet in a frenzy.",
    draw: () => inkLine("M5 2C4 9 5 15 8 22M12 2C11 9 12 15 15 22M19 2C18 9 19 15 22 22", 3),
  },
  "beak-drop": {
    means: "Scavenger's Focus: a hooked beak over a drop: Energy picked off a suffering foe.",
    draw: () =>
      inkFill("M2 3C13 2 21 7 21 14L16.500 10C14 8 8 7.500 2 8Z") +
      inkFill(
        "M14 14C16.500 18 17.500 19 17.500 20.500A3.500 3.500 0 0 1 10.500 20.500C10.500 19 11.500 18 14 14Z",
      ),
  },
  "spikes-plate": {
    means:
      "Piercing Trap: three solid spikes rising from a floor plate: a trap that pierces armor.",
    draw: () =>
      inkFill("M2 19H22V22H2Z") +
      inkFill(
        "M4.500 19L7.500 7L10.500 19ZM9.500 19L12.500 3L15.500 19ZM14.500 19L17.500 7L20.500 19Z",
      ),
  },
  "paw-bolt": {
    means:
      "Feral Aggression: a solid paw print with a bolt cut in its pad: a pet's burst of speed.",
    draw: () =>
      inkFill(
        "M12 11.500C17 11.500 19 15 19 17.500A3 3 0 0 1 15.500 20C14 20 13 19 12 19C11 19 10 20 8.500 20A3 3 0 0 1 5 17.500C5 15 7 11.500 12 11.500Z",
      ) +
      inkFill(
        "M3.500 8A2 2.500 0 1 1 3.500 13A2 2.500 0 1 1 3.500 8ZM8.500 2.500A2 2.500 0 1 1 8.500 7.500A2 2.500 0 1 1 8.500 2.500ZM15.500 2.500A2 2.500 0 1 1 15.500 7.500A2 2.500 0 1 1 15.500 2.500ZM20.500 8A2 2.500 0 1 1 20.500 13A2 2.500 0 1 1 20.500 8Z",
      ) +
      `<path d="M13 13.500L10.500 17H13.500L11.500 20" ${stroke(C.bg, 1.6)}/>`,
  },
  "leaf-cycle": {
    means: "Nature's Renewal: a solid leaf inside a circling arrow: the ritual that renews itself.",
    draw: () =>
      inkLine("M21 12A9 9 0 1 1 12 3", 2.2) +
      inkFill("M12 0L17 3.500L12 7Z") +
      inkFill("M12 18C7.500 16 8.500 11 12 8C15.500 11 16.500 16 12 18Z"),
  },
  "half-sun": {
    means: "Equinox: a solid half sun on the horizon with rays: day and night held level.",
    draw: () =>
      inkFill("M5 17A7 7 0 0 1 19 17Z") +
      inkLine("M2 20H22M12 3V7M4 8L6.500 10.500M20 8L17.500 10.500M2 14H4M20 14H22", 2.2),
  },
  "bow-arrow-bar": {
    means: "Archer's Signet: a bow with a long arrow drawn across it: conditions that last longer.",
    draw: () =>
      inkLine("M5 2C14 6 14 18 5 22M5 2V22", 2.2) +
      inkLine("M8 12H20", 2.4) +
      inkFill("M23 12L18 8.500V15.500Z"),
  },
  "hourglass-doom": {
    means: "Doom: a solid hourglass with its sand nearly gone: time running out.",
    draw: () =>
      inkFill("M5 2H19L12.800 12L19 22H5L11.200 12Z") +
      `<path d="M9 5H15L12 10ZM9 19L12 15L15 19Z" fill="${C.bg}"/>`,
  },
};

export default glyphs;
