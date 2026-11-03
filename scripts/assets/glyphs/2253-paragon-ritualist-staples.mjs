// Glyphs (#2253): the Paragon staples of #2222 and the Ritualist staples of
// #2212.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** A small bolt, centred on (x, y), `k` times the full-grid one. @param {number} x @param {number} y @param {number} k */
const bolt = (x, y, k) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-12)">` +
  inkFill("M13 2L5 13.5H11L10 22L19 10H13Z") +
  "</g>";

/** A small plus, centred on (x, y), arms `r` long. @param {number} x @param {number} y @param {number} r */
const plus = (x, y, r) =>
  inkLine(
    `M${String(x)} ${String(y - r)}V${String(y + r)}M${String(x - r)} ${String(y)}H${String(x + r)}`,
    3,
  );

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "notes-bolt": {
    means:
      "Song of Power: two beamed notes with a bolt over them: a chant that pours Energy into the allies who hear it.",
    draw: () =>
      inkFill("M3 16A3 2.4 0 1 0 9 16A3 2.4 0 1 0 3 16Z") +
      inkFill("M11 19A3 2.4 0 1 0 17 19A3 2.4 0 1 0 11 19Z") +
      inkLine("M8.6 16V8L16.6 6V19", 2) +
      inkFill("M8.6 7.5L16.6 5.5V8.5L8.6 10.5Z") +
      bolt(19, 7, 0.55),
  },
  "note-half-plus": {
    means:
      "Ballad of Restoration: one hollow note with a plus beside it: a slow song that heals whoever is hit next.",
    draw: () =>
      `<ellipse cx="8" cy="18" rx="4.2" ry="3.2" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M12 17.5V4", 2.2) +
      plus(18, 9, 3.5),
  },
  "figure-crowd-bolt": {
    means:
      "Leader's Zeal: a large figure with two smaller ones at its sides and a bolt above: Energy for every ally near you.",
    draw: () =>
      `<circle cx="12" cy="12" r="3.4" fill="${C.ink}"/><circle cx="4.5" cy="15" r="2.2" fill="${C.ink}"/><circle cx="19.5" cy="15" r="2.2" fill="${C.ink}"/>` +
      inkFill("M5.5 22C5.5 17 8 16 12 16S18.5 17 18.5 22Z") +
      bolt(12, 4, 0.55),
  },
  "bars-rising": {
    means:
      '"Make Your Time!": three heads over three filled adrenaline bars: strikes of adrenaline for every party member in earshot.',
    draw: () =>
      `<circle cx="5.5" cy="5.5" r="2.4" fill="${C.ink}"/><circle cx="12" cy="5.5" r="2.4" fill="${C.ink}"/><circle cx="18.5" cy="5.5" r="2.4" fill="${C.ink}"/>` +
      inkFill("M3 12H8V21H3ZM9.5 12H14.5V21H9.5ZM16 12H21V21H16Z"),
  },
  "flame-less": {
    means:
      '"They\'re on Fire!": a flame beside two chevrons pointing down: burning foes hit the party less.',
    draw: () =>
      inkFill(
        "M8 3c.5 3.2 4 4.8 4 8.8a5.2 5.2 0 0 1-10.4 0c0-2.4.9-4 2.3-5 0 1.8.5 2.8 1.4 3.3-.4-2.8.9-5.3 2.7-7.1z",
      ) + inkLine("M15 6L19 10L23 6M15 13L19 17L23 13", 2.2),
  },
  "burst-cut": {
    means:
      '"Find Their Weakness!": a critical star over a deep gash with a drop at its tip: the next critical wounds deeply.',
    draw: () =>
      inkFill(
        "M7 1L8.7 5L12.8 3.8L10.8 7.6L14 10L10 11L9.4 15L7 12L4.5 15L4 11L0 10L3.2 7.6L1.2 3.8L5.3 5Z",
      ) +
      inkLine("M10 12L20 20", 3) +
      inkFill(
        "M21 14C22.5 16.5 23.5 17.5 23.5 19A2.5 2.5 0 0 1 18.5 19C18.5 17.5 19.5 16.5 21 14Z",
      ),
  },
  "eye-bolt-pupil": {
    means:
      "Gaze from Beyond: an open eye with a bolt for its pupil: a blast out of a spirit's stare.",
    draw: () =>
      `<path d="M2 12C5 6.5 8.5 4.5 12 4.5S19 6.5 22 12C19 17.5 15.5 19.5 12 19.5S5 17.5 2 12Z" ${stroke(C.ink, 2.2)}/>` +
      bolt(12, 12, 0.55),
  },
  "ring-bolt-rays": {
    means:
      "Ancestors' Rage: a small ring (the ally) with four jagged bolts leaping outward: foes beside the ally are struck.",
    draw: () =>
      `<circle cx="12" cy="12" r="3.4" ${stroke(C.ink, 2.4)}/>` +
      inkLine(
        "M12 8.2L10 5L13 3.5L11 0.8M12 15.8L14 19L11 20.5L13 23.2M8.2 12L5 14L3.5 11L0.8 13M15.8 12L19 10L20.5 13L23.2 11",
        1.8,
      ),
  },
  "bolt-urn": {
    means:
      "Channeled Strike: a bolt falling onto a small urn of ashes: it strikes harder for what you hold.",
    draw: () => bolt(12, 8, 0.85) + inkFill("M7 15H17L16 21H8ZM9 13H15V15H9Z"),
  },
  "plus-thought": {
    means:
      "Soothing Memories: a plus in a thought bubble with two small bubbles trailing: a heal remembered, with Energy for what you hold.",
    draw: () =>
      `<path d="M7 3H17A4.5 4.5 0 0 1 21.5 7.5V10A4.5 4.5 0 0 1 17 14.5H7A4.5 4.5 0 0 1 2.5 10V7.5A4.5 4.5 0 0 1 7 3Z" ${stroke(C.ink, 2.2)}/>` +
      plus(12, 8.8, 3) +
      `<circle cx="6.5" cy="18.3" r="1.9" fill="${C.ink}"/><circle cx="3.2" cy="21.7" r="1.2" fill="${C.ink}"/>`,
  },
  "pluses-mirrored": {
    means:
      "Ghostmirror Light: a plus and its smaller twin either side of a dashed mirror line: the ally is healed, and so are you if a spirit is near.",
    draw: () =>
      inkLine("M12 2V22", 1.8).replace(
        'stroke-linecap="round"',
        'stroke-linecap="butt" stroke-dasharray="3 2.6"',
      ) +
      plus(6, 12, 4) +
      inkLine("M17.5 8.5V15.5M14 12H21", 2.2),
  },
  "blade-blunt-nocrit": {
    means:
      "Dulled Weapon: a sword with a flat, blunted tip and a struck-out star beside it: no critical hits, and less damage.",
    draw: () =>
      inkFill("M6 3H11V16H6Z") +
      inkLine("M3 17.5H14M8.5 17.5V22", 2.6) +
      inkFill("M18 3L19.2 6L22.4 6.4L20 8.6L20.7 11.8L18 10.2L15.3 11.8L16 8.6L13.6 6.4L16.8 6Z") +
      inkLine("M14 13L22.5 2", 2.4),
  },
};

export default glyphs;
