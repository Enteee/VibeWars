// Glyphs (#2251): the Necromancer staples of #2230 and the Mesmer staples of
// #2231.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** A small drop centred on (x, y), `k` times the size of the full-grid drop. @param {number} x @param {number} y @param {number} k */
const drop = (x, y, k) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-12)">` +
  inkFill("M12 2.5C16 8.5 19 12 19 15.5A7 7 0 0 1 5 15.5C5 12 8 8.5 12 2.5Z") +
  "</g>";

/** A bolt, `k` times the full-grid one, centred on (x, y), filled or hollow. @param {number} x @param {number} y @param {number} k @param {boolean} solid */
const bolt = (x, y, k, solid) =>
  `<g transform="translate(${String(x)},${String(y)}) scale(${String(k)}) translate(-12,-12)">` +
  (solid
    ? inkFill("M13 2L5 13.5H11L10 22L19 10H13Z")
    : `<path d="M13 2L5 13.5H11L10 22L19 10H13Z" ${stroke(C.ink, 2.4 / k)}/>`) +
  "</g>";

/** A dashed ring, the mark of a hex, centred on (x, y). @param {number} x @param {number} y @param {number} r */
const hexRing = (x, y, r) =>
  `<circle cx="${String(x)}" cy="${String(y)}" r="${String(r)}" ${stroke(C.ink, 2.2)} stroke-dasharray="${(r * 0.5).toFixed(1)} ${(r * 0.38).toFixed(1)}"/>`;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "drops-three": {
    means:
      "Virulence: three drops in a triangle, three conditions (Disease, Poison, Weakness) laid on one foe.",
    draw: () => drop(7, 8.5, 0.52) + drop(17, 8.5, 0.52) + drop(12, 17, 0.52),
  },
  "snowflake-drop": {
    means:
      "Chilblains: a snowflake with a drop at its foot: cold struck down on foes, a poison taken on by you.",
    draw: () => inkLine("M10 2.5V15M4 6L16 11.5M4 11.5L16 6", 2.2) + drop(18, 18, 0.5),
  },
  "swarm-chill": {
    means:
      "Deathly Swarm: a trail of small insect diamonds behind a round head: a slow swarm of cold flies out.",
    draw: () =>
      inkFill("M2 5L5 4L6 7L3 8Z") +
      inkFill("M3 14L7 12.5L8.5 16L4.5 17.5Z") +
      inkFill("M8 4.5L12 3L13.5 6.5L9.5 8Z") +
      inkFill("M9.5 14L13.5 12.5L15 16L11 17.5Z") +
      `<circle cx="17.5" cy="11" r="5" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>`,
  },
  "eye-teeth": {
    means:
      "Ravenous Gaze: an open eye with teeth along its lower lid: a stare that bites and feeds.",
    draw: () =>
      `<path d="M2.5 9C5 4.5 8.5 3 12 3S19 4.5 21.5 9" ${stroke(C.ink, 2.2)}/>` +
      `<circle cx="12" cy="8.5" r="2.6" fill="${C.ink}"/>` +
      inkFill(
        "M3 12L6.5 12L4.8 17ZM8.5 12L12 12L10.3 18ZM13.5 12L17 12L15.3 18ZM18.5 12L21.5 12L20 16Z",
      ),
  },
  "fangs-drop": {
    means:
      "Vampiric Spirit: two fangs biting down into a drop: Health stolen, and kept as regeneration.",
    draw: () => inkFill("M5 2L11 2L8 10ZM13 2L19 2L16 10Z") + drop(12, 16.5, 0.62),
  },
  "bolt-hollow-to-solid": {
    means:
      "Energy Drain: a hollow bolt, the foe's, with an arrow carrying it to a solid bolt, yours.",
    draw: () =>
      bolt(6, 12, 0.7, false) +
      inkLine("M11.5 12H15", 2.2) +
      inkFill("M14 8L18 12L14 16Z") +
      bolt(19.2, 12, 0.5, true),
  },
  "signet-bolt-hollow": {
    means:
      "Signet of Weariness: a signet ring round a hollow bolt: the foes nearby are emptied of Energy.",
    draw: () => `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2)}/>` + bolt(12, 12, 0.6, false),
  },
  "moon-sink": {
    means:
      "Conjure Nightmare: a crescent moon above three chevrons sinking: a foe's sleep that drains Health.",
    draw: () =>
      inkFill("M13 2A7.5 7.5 0 1 0 13 17A9 9 0 0 1 13 2Z") +
      inkLine("M15.5 8L18.5 11L21.5 8M15.5 13L18.5 16L21.5 13M5 20L8 22.5L11 20", 2),
  },
  "mirror-self": {
    means:
      "Images of Remorse: a solid disc and its dashed twin with a lightning crack between: strike, and the blow comes back.",
    draw: () =>
      `<circle cx="6.5" cy="12" r="4.5" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      hexRing(17.5, 12, 4.5) +
      inkLine("M12 3.5L10.5 9L13.5 12L11 20.5", 2),
  },
  "question-echo": {
    means:
      "Confusing Images: a question mark with a thin echo behind it: foes are unsure, and slow to cast.",
    draw: () =>
      `<path d="M7.5 8C7.5 4 15.5 3.5 15.5 8.5C15.5 12 11 12 11 16" ${stroke(C.ink, 1.3)} transform="translate(3,3)" opacity="0.6"/>` +
      `<path d="M5.5 7.5C5.5 3 13 2.5 13 7.5C13 11.5 8.5 11 8.5 15.5" ${stroke(C.ink, 2.4)}/>` +
      `<circle cx="8.5" cy="20" r="1.7" fill="${C.ink}"/>`,
  },
  "ring-spark": {
    means:
      "Discharge Enchantment: a solid enchantment ring split open at the top right, sparks flying out of the gap: the enchantment is removed.",
    draw: () =>
      `<path d="M15 8.5A7 7 0 1 0 17.5 14" ${stroke(C.ink, 3)}/>` +
      inkLine("M16 3.5L19 7M19.5 10.5H22.5M12 2.5V5", 2.2),
  },
  "hex-pair-cut": {
    means:
      "Expel Hexes: two dashed hex rings under one slash: up to two hexes struck from an ally.",
    draw: () =>
      hexRing(8, 9, 5.5) +
      hexRing(16, 15.5, 5.5) +
      `<path d="M3 21L21 3" ${stroke(C.bg, 5)}/>` +
      inkLine("M3 21L21 3", 2.4),
  },
};

export default glyphs;
