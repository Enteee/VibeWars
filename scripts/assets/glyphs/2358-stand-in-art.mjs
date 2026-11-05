// Glyphs (#2358): the stand-ins of #2314 and #2335.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "lungs-drop": {
    means:
      "Ulcerous Lungs: two solid lungs with a drop between them: a cough that makes foes bleed.",
    draw: () =>
      inkFill("M10.500 3V10C10.500 14 8 18 4.500 18C2.500 18 2 15 2.500 12C3.500 7 7 3 10.500 3Z") +
      inkFill(
        "M13.500 3V10C13.500 14 16 18 19.500 18C21.500 18 22 15 21.500 12C20.500 7 17 3 13.500 3Z",
      ) +
      inkFill(
        "M12 14C13.500 16 14 16.500 14 17.500A2 2 0 0 1 10 17.500C10 16.500 10.500 16 12 14Z",
      ),
  },
  "drops-linked": {
    means: "Blood Bond: two drops joined by a bar: the attackers' blood tied to the target.",
    draw: () =>
      inkFill("M6 3C8 6 9 7 9 8.500A3 3 0 0 1 3 8.500C3 7 4 6 6 3Z") +
      inkFill("M18 3C20 6 21 7 21 8.500A3 3 0 0 1 15 8.500C15 7 16 6 18 3Z") +
      inkLine("M6 14V20H18V14", 2.2) +
      inkLine("M12 20V22", 2),
  },
  "heart-poison": {
    means: "Poisoned Heart: a solid heart with a cross cut through it: a heart that is poisoned.",
    draw: () =>
      inkFill("M12 21L3.500 12.500A5 5 0 0 1 12 6A5 5 0 0 1 20.500 12.500Z") +
      `<path d="M9 11L15 17M15 11L9 17" ${stroke(C.bg, 1.8)}/>`,
  },
  "miasma-swirl": {
    means: "Vile Miasma: a rotting spiral with three drips below: a foul cloud that sickens.",
    draw: () =>
      inkLine(
        "M12 12A2.500 2.500 0 1 1 14.500 9.500A5 5 0 1 1 9 5A7.500 7.500 0 0 1 19.500 12",
        2.2,
      ) + inkLine("M7 18V22M12 18V21M17 18V22", 2),
  },
  "bolts-pair": {
    means: "Depravity: two small bolts side by side: Energy torn from two foes.",
    draw: () => inkFill("M9 2L3 12H8L6 22L13 10H8Z") + inkFill("M19 2L14 11H18L17 20L22 9H18Z"),
  },
  "drop-less": {
    means:
      "Cultist's Fervor: a big drop with three shrinking bars beside it: cheaper spells paid in blood.",
    draw: () =>
      inkFill("M15 3C19 9 21 11 21 14A6 6 0 0 1 9 14C9 11 11 9 15 3Z") +
      inkLine("M2 8H6M2 13H5M2 18H4", 2),
  },
  "maw-drop": {
    means: "Blood Drinker: two fangs over a drop: blood drunk.",
    draw: () =>
      inkFill("M2 3H22V8L19 17L16 8L12 8L8 8L5 17L2 8Z") +
      inkFill(
        "M12 16C13.500 18 14 18.500 14 19.500A2 2 0 0 1 10 19.500C10 18.500 10.500 18 12 16Z",
      ),
  },
  "sword-through": {
    means:
      "Warrior's Cunning: a blade piercing through a shield's rim: a strike that cannot be blocked.",
    draw: () =>
      inkLine("M12 3L4 6V12C4 17 8 20 12 22C16 20 20 17 20 12V6Z", 2) +
      inkLine("M3 21L21 3", 3) +
      inkFill("M23 1L16 3L21 8Z"),
  },
  "hammer-armor": {
    means:
      "Dwarven Battle Stance: a hammer head with a small shield below: armor while a hammer is wielded.",
    draw: () =>
      inkLine("M3 15L11 7", 2.4) +
      `<rect x="8" y="2" width="12" height="7" rx="1" transform="rotate(45 14 5.500)" fill="${C.ink}"/>` +
      inkFill("M14 13H22V17C22 20 18 22 18 22C18 22 14 20 14 17Z"),
  },
};

export default glyphs;
