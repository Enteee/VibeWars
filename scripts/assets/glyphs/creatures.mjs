// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, smallFigure, smallSkull, pawPrint, glyph } from "../glyph-kit.mjs";

/**
 * The pet attacks of #2003: the claw gashes low and left, a small mark in the
 * free top right for what the strike pays off. @param {string} mark
 */
const clawMark = (mark) =>
  `<g transform="translate(0.5,3) scale(0.8)">${inkLine("M5.5 4L9.5 20M10.5 4L13 15M15.5 4L18 11", 2.8)}</g>` +
  mark;

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "fox-head": {
    means: "A fox's head, ears up: the strikes it lends cannot be blocked.",
    draw: () =>
      `<path d="M3.5 2.5L9 8H15L20.5 2.5V12L12 21.5L3.5 12Z" ${stroke(C.ink, 2.2)}/>` +
      `<circle cx="8.8" cy="12" r="1.3" fill="${C.ink}"/><circle cx="15.2" cy="12" r="1.3" fill="${C.ink}"/>` +
      inkFill("M10.5 17.5H13.5L12 20Z"),
  },
  "ox-horns": {
    means: "Two horns over a falling chevron: a charge that flattens (#1049).",
    draw: () =>
      inkLine("M4 4C4 11 8 13 12 13C16 13 20 11 20 4", 2.6) +
      inkLine("M8.5 16.5L11.5 20L14.5 16.5", 2.4),
  },
  spider: {
    means: "A spider from above, eight legs: poison from the fall (#1049).",
    draw: () =>
      `<circle cx="12" cy="9" r="2.6" fill="${C.ink}"/><ellipse cx="12" cy="14.5" rx="3.6" ry="4.4" fill="${C.ink}"/>` +
      inkLine(
        "M9.5 8L4 4.5M9 10.5L3 10M9 13.5L3.5 16.5M10 17L6 21M14.5 8L20 4.5M15 10.5L21 10M15 13.5L20.5 16.5M14 17L18 21",
        1.8,
      ),
  },
  dolyak: {
    means: "A bull's head, front on, with wide horns and a broad muzzle: the dolyak (#1396).",
    draw: () =>
      inkLine("M5 11C2.5 10.5 2 7 3.5 4.5M19 11C21.5 10.5 22 7 20.5 4.5", 2.4) +
      inkFill("M6 9L18 9L16.5 15.5L14 20H10L7.5 15.5Z") +
      `<circle cx="9.7" cy="12.5" r="1.1" fill="${C.bg}"/><circle cx="14.3" cy="12.5" r="1.1" fill="${C.bg}"/>`,
  },
  "bone-minions": {
    means: "Two small skulls, one raised: a pack of minions (#1112).",
    draw: () => smallSkull(8.5, 14, 0.62) + smallSkull(15.5, 9.5, 0.62),
  },
  "vampire-horror": {
    means: "A skull between bat wings, fangs down: the vampiric horror (#1860).",
    draw: () =>
      smallSkull(12, 12, 0.7) +
      inkFill("M7 9L2 5L2.8 11L5 14L5.5 17L8 14ZM17 9L22 5L21.2 11L19 14L18.5 17L16 14Z") +
      inkFill("M10 19L10.8 22.5L11.6 19ZM12.4 19L13.2 22.5L14 19Z"),
  },
  golem: {
    means: "A square head on wide shoulders, stitched: the flesh golem (#1860).",
    draw: () =>
      inkFill("M8 2.5H16V12H8Z") +
      inkFill("M3 13.5H21V21.5H3Z") +
      `<rect x="9.7" y="5.2" width="1.8" height="1.8" fill="${C.bg}"/><rect x="12.5" y="5.2" width="1.8" height="1.8" fill="${C.bg}"/>` +
      `<path d="M8 9.6H16M12 13.5V21.5M7 13.5V17.5M17 13.5V17.5" stroke="${C.bg}" stroke-width="1.1"/>`,
  },
  "rot-flesh": {
    means: "A slab of flesh, stitched, with fumes rising: Putrid Flesh (#1860).",
    draw: () =>
      inkFill("M4 11C4 9 8 8.5 12 8.5S20 9 20 11V19C20 20.5 16 21 12 21S4 20.5 4 19Z") +
      `<path d="M8 13.5L10 16M10 13.5L8 16M14 13.5L16 16M16 13.5L14 16" stroke="${C.bg}" stroke-width="1.2"/>` +
      inkLine(
        "M8 6C6.5 4.7 9.5 3.8 8 2M12.5 6C11 4.7 14 3.8 12.5 2M17 6C15.5 4.7 18.5 3.8 17 2",
        1.6,
      ),
  },
  "feast-jaw": {
    means: "A jaw open on a heart: Feast for the Dead (#1860).",
    draw: () =>
      inkFill("M3 3.5L5.3 9L7.6 3.5L10 9L12 3.5L14 9L16.4 3.5L18.7 9L21 3.5V10H3Z") +
      inkFill("M3 21L5.3 15.5L7.6 21L10 15.5L12 21L14 15.5L16.4 21L18.7 15.5L21 21V14H3Z") +
      `<path d="M12 13.5C9 11.5 9 9 10.6 9C11.3 9 11.8 9.4 12 10C12.2 9.4 12.7 9 13.4 9C15 9 15 11.5 12 13.5Z" fill="${C.bg}"/>`,
  },
  "bone-horror": {
    means: "One big horned skull: the horror (#1112).",
    draw: () =>
      smallSkull(12, 13, 0.85) +
      inkLine("M6.5 8.5C4 7.5 3.5 5 4 3M17.5 8.5C20 7.5 20.5 5 20 3", 2.2),
  },
  jaws: {
    means: "A row of teeth rising from the ground: a trap's jaws, ready to bite (#1129).",
    draw: () =>
      inkLine("M3 19.5H14", 2.2) +
      inkFill("M3 18.5L4.8 6.5L6.6 18.5L8.4 6.5L10.2 18.5L12 6.5L13.8 18.5Z"),
  },
  paw: {
    means: "A paw print: your pet (#1215).",
    draw: () => pawPrint(C.ink),
  },
  "paw-heart": {
    means: "A heart with a paw cut from it: an animal won over (#1215).",
    draw: () =>
      inkFill(
        "M12 21C3.5 14.5 2.5 8.5 6.3 5.7 9 3.8 11.3 5 12 7 12.7 5 15 3.8 17.7 5.7 21.5 8.5 20.5 14.5 12 21Z",
      ) + `<g transform="translate(12,13.2) scale(0.42) translate(-12,-12)">${pawPrint(C.bg)}</g>`,
  },
  bond: {
    means: "Two linked rings: the pet's hurt shared, as the status shows (#1215).",
    draw: () =>
      `<circle cx="8.5" cy="12" r="5.5" ${stroke(C.ink, 2.6)}/><circle cx="15.5" cy="12" r="5.5" ${stroke(C.ink, 2.6)}/>`,
  },
  "paw-speed": {
    means: "Two chevrons, a paw behind them: the pet is hurried (#1215).",
    draw: () =>
      `<g transform="translate(14.5,14) scale(0.62) translate(-12,-12)">${pawPrint(C.ink)}</g>` +
      inkLine("M3.5 3.5L9 8.5L3.5 13.5M9.5 3.5L15 8.5L9.5 13.5", 2.2),
  },
  "paw-shield": {
    means: "A shield with a paw cut from it: the pet is guarded (#1215).",
    draw: () =>
      inkFill("M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z") +
      `<g transform="translate(12,12.5) scale(0.5) translate(-12,-12)">${pawPrint(C.bg)}</g>`,
  },
  "paw-maul": {
    means:
      "Pets 2 (#1865, #1939): the paw is the pet; what it does with you, or to whom, beside it. Bestial Mauling: the paw comes down on a foe laid flat, dazed stars either side.",
    draw: () =>
      `<g transform="translate(12,8.5) scale(0.62) translate(-12,-12)">${pawPrint(C.ink)}</g>` +
      inkLine("M2.5 20H21.5", 3.2) +
      inkFill("M4.5 11L5.4 13.1L7.5 14L5.4 14.9L4.5 17L3.6 14.9L1.5 14L3.6 13.1Z") +
      inkFill("M19.5 11L20.4 13.1L22.5 14L20.4 14.9L19.5 17L18.6 14.9L16.5 14L18.6 13.1Z"),
  },
  "paw-pounce-spell": {
    means: "Savage Pounce: the paw leaps on to a spell's four-point star.",
    draw: () =>
      `<g transform="translate(7,17) scale(0.5) translate(-12,-12)">${pawPrint(C.ink)}</g>` +
      `<path d="M3 11C4.5 4 11 1.5 15.5 5" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M18 7L19.4 11.1L23.5 12.5L19.4 13.9L18 18L16.6 13.9L12.5 12.5L16.6 11.1Z"),
  },
  "paw-shield-cry": {
    means: "Otyugh's Cry: the guarded paw and the shout's arcs.",
    draw: () =>
      `<g transform="translate(9,12) scale(0.78) translate(-12,-12)">` +
      inkFill("M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z") +
      `<g transform="translate(12,12.5) scale(0.5) translate(-12,-12)">${pawPrint(C.bg)}</g></g>` +
      inkLine("M17.5 8A5 5 0 0 1 17.5 16M20.5 5A9 9 0 0 1 20.5 19", 2),
  },
  "paw-bond-plus": {
    means: "Predatory Bond: the pet's blows send a plus back to you.",
    draw: () =>
      `<g transform="translate(7.5,15.5) scale(0.55) translate(-12,-12)">${pawPrint(C.ink)}</g>` +
      inkLine("M11 10.5L14.5 7.5", 2) +
      inkLine("M18 2.5V11.5M13.5 7H22.5", 3),
  },
  "figure-paw-plus": {
    means: "Companionship: you and your pet, a plus over you both for the lower.",
    draw: () =>
      smallFigure(7, 15, 0.6) +
      `<g transform="translate(17.5,17) scale(0.45) translate(-12,-12)">${pawPrint(C.ink)}</g>` +
      inkLine("M12 1.5V8.5M8.5 5H15.5", 2.4),
  },
  "figure-paw-run": {
    means: "Run as One: you and your pet under speed chevrons.",
    draw: () =>
      smallFigure(7, 15, 0.6) +
      `<g transform="translate(17.5,17) scale(0.45) translate(-12,-12)">${pawPrint(C.ink)}</g>` +
      inkLine("M5 2L9.5 5.5L5 9M13 2L17.5 5.5L13 9", 2.2),
  },
  "figure-paw-rampage": {
    means:
      "Rampage as One: the same pair, the chevrons and the claw's gashes: faster at running and at blows.",
    draw: () =>
      smallFigure(7, 15, 0.6) +
      `<g transform="translate(17.5,17) scale(0.45) translate(-12,-12)">${pawPrint(C.ink)}</g>` +
      inkLine("M2 2L6.5 5.5L2 9M8.5 2L13 5.5L8.5 9", 2.2) +
      inkLine("M15 1.5L16.5 9M18.5 1.5L20 9M22 1.5L23.5 9", 1.8),
  },
  "jaws-bolt": {
    means: "jaws bolt",
    draw: () =>
      `<g transform="translate(-1,2) scale(0.95)">${glyph("jaws")}</g>` +
      inkFill("M20.5 1.5L14 10H18.5L15.5 17.5L23 8.5H18.8Z"),
  },
  "jaws-drop": {
    means: "jaws drop",
    draw: () =>
      `<g transform="translate(-1,2) scale(0.95)">${glyph("jaws")}</g>` +
      `<path d="M18 3C18 3 13.5 8.5 13.5 11.5A4.5 4.5 0 0 0 22.5 11.5C22.5 8.5 18 3 18 3Z" fill="${C.ink}"/>`,
  },
  "bond-spike": {
    means: "Two linked rings under a spike: the hex that makes spirits hit harder (#1319).",
    draw: () =>
      `<circle cx="8.5" cy="16" r="4.6" ${stroke(C.ink, 2.2)}/><circle cx="15.5" cy="16" r="4.6" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M12 2.5V9.5", 2.8),
  },
  spine: {
    means: "Spinal Shivers (#1931): a spine, bone after bone.",
    draw: () =>
      inkLine("M12 3V21", 2) +
      [4.5, 9.5, 14.5, 19.5]
        .map(
          (y) =>
            `<ellipse cx="12" cy="${String(y)}" rx="4.6" ry="2.1" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>`,
        )
        .join(""),
  },
  hawk: {
    means: "A hawk seen from below, wings swept back (#1007).",
    draw: () =>
      inkFill(
        "M12 2.5L14 6L12.8 9L22 7.5Q20 16 14.5 17.5L15 21.5L12 19.5L9 21.5L9.5 17.5Q4 16 2 7.5L11.2 9L10 6Z",
      ),
  },
  snake: {
    means: "An S-curved snake with chevrons.",
    draw: () =>
      inkLine("M17 4C7 4 6 10 12 12C18 14 17 20 7 20", 3) +
      `<circle cx="18.5" cy="4" r="2.2" fill="${C.ink}"/>` +
      `<g transform="translate(19,19) scale(0.4) translate(-12,-12)">${glyph("speed")}</g>`,
  },
  "bond-plus-hit": {
    means:
      "Monk mechanics (#1754, #1784): two linked rings, a plus in one, a heavy blow's chevrons below.",
    draw: () =>
      `<circle cx="8" cy="9" r="5" ${stroke(C.ink, 2)}/><circle cx="16" cy="9" r="5" ${stroke(C.ink, 2)}/>` +
      inkLine("M8 6.5V11.5M5.5 9H10.5", 1.8) +
      inkLine("M4 18L8 21.5L12 18M12.5 18L16.5 21.5L20.5 18", 1.8),
  },
  "death-bolt": {
    means: "Death triggers (#1762, #1832): a skull, and what its death gives.",
    draw: () =>
      `<path d="M8 3.5a4.5 4.5 0 0 0-4.5 4.5c0 1.6.8 2.7 2 3.4V14H10.5V11.4c1.2-.7 2-1.8 2-3.4A4.5 4.5 0 0 0 8 3.5z" ${stroke(C.ink, 1.8)}/>` +
      `<circle cx="6.2" cy="8" r="1.1" fill="${C.ink}"/><circle cx="9.8" cy="8" r="1.1" fill="${C.ink}"/>` +
      `<path d="M18 9L12.5 17H17L15.5 23L22 14H17.5Z" fill="${C.ink}"/>`,
  },
  "death-bile": {
    means: "death bile",
    draw: () =>
      `<path d="M8 3.5a4.5 4.5 0 0 0-4.5 4.5c0 1.6.8 2.7 2 3.4V14H10.5V11.4c1.2-.7 2-1.8 2-3.4A4.5 4.5 0 0 0 8 3.5z" ${stroke(C.ink, 1.8)}/>` +
      `<circle cx="6.2" cy="8" r="1.1" fill="${C.ink}"/><circle cx="9.8" cy="8" r="1.1" fill="${C.ink}"/>` +
      `<path d="M17 11c2.2 2.8 3.6 4.6 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-1.8 1.4-3.6 3.6-6.4z" fill="${C.ink}"/>` +
      `<circle cx="13" cy="22" r="1.3" fill="${C.ink}"/><circle cx="21.5" cy="22.3" r="1.3" fill="${C.ink}"/>`,
  },
  "death-frost": {
    means: "death frost",
    draw: () =>
      `<path d="M8 3.5a4.5 4.5 0 0 0-4.5 4.5c0 1.6.8 2.7 2 3.4V14H10.5V11.4c1.2-.7 2-1.8 2-3.4A4.5 4.5 0 0 0 8 3.5z" ${stroke(C.ink, 1.8)}/>` +
      `<circle cx="6.2" cy="8" r="1.1" fill="${C.ink}"/><circle cx="9.8" cy="8" r="1.1" fill="${C.ink}"/>` +
      `<path d="M17.5 11V23M12.3 14L22.7 20M12.3 20L22.7 14" ${stroke(C.ink, 1.8)}/>`,
  },
  "death-recharge": {
    means: "death recharge",
    draw: () =>
      `<path d="M8 3.5a4.5 4.5 0 0 0-4.5 4.5c0 1.6.8 2.7 2 3.4V14H10.5V11.4c1.2-.7 2-1.8 2-3.4A4.5 4.5 0 0 0 8 3.5z" ${stroke(C.ink, 1.8)}/>` +
      `<circle cx="6.2" cy="8" r="1.1" fill="${C.ink}"/><circle cx="9.8" cy="8" r="1.1" fill="${C.ink}"/>` +
      `<path d="M22.5 18a5 5 0 1 1-1.5-3.6M22.5 11.5V15H19" ${stroke(C.ink, 2)}/>`,
  },
  "death-heal": {
    means: "death heal",
    draw: () =>
      `<path d="M8 3.5a4.5 4.5 0 0 0-4.5 4.5c0 1.6.8 2.7 2 3.4V14H10.5V11.4c1.2-.7 2-1.8 2-3.4A4.5 4.5 0 0 0 8 3.5z" ${stroke(C.ink, 1.8)}/>` +
      `<circle cx="6.2" cy="8" r="1.1" fill="${C.ink}"/><circle cx="9.8" cy="8" r="1.1" fill="${C.ink}"/>` +
      `<path d="M17.5 12v10M12.5 17h10" ${stroke(C.ink, 2.4)}/>`,
  },
  "skull-order": {
    means: "A skull over crossed bones: the order to rise (#1946).",
    draw: () => smallSkull(12, 9, 0.75) + inkLine("M5 16L19 22M19 16L5 22", 2.2),
  },
  "skull-aura": {
    means: "A skull in a dotted ring: the lich's aura (#1946).",
    draw: () =>
      smallSkull(12, 12, 0.6) +
      `<circle cx="12" cy="12" r="10" ${stroke(C.ink, 1.8)} stroke-dasharray="1.8 3.1"/>`,
  },
  "skull-heal": {
    means: "A skull and a plus: the minion's death heals (#1946).",
    draw: () => smallSkull(8, 13, 0.85) + inkLine("M18 7V17M13 12H23", 2.4),
  },
  "paw-leap": {
    means: "A paw under a leaping arc.",
    draw: () =>
      `<g transform="translate(12,16.5) scale(0.62) translate(-12,-12)">${pawPrint(C.ink)}</g>` +
      `<path d="M3.5 10C6 2.5 15 1.5 19.5 6.5" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M22 10L16 8L20.8 3.5Z"),
  },
  "paw-lunge": {
    means: "A paw tilted forward with three streaks.",
    draw: () =>
      `<g transform="translate(15.5,12) rotate(35) scale(0.7) translate(-12,-12)">${pawPrint(C.ink)}</g>` +
      inkLine("M2.5 7H8M2.5 12H6M2.5 17H8", 2.2),
  },
  "nest-snake": {
    means: "A snake rising from a bowl.",
    draw: () =>
      `<path d="M2.5 15C3.5 21 20.5 21 21.5 15" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M12 15C6.5 12.5 16.5 9.5 11.5 5", 2.8) +
      `<circle cx="11" cy="3.8" r="2.2" fill="${C.ink}"/>`,
  },
  "claw-heal": {
    means: "Claw gashes with a plus: a pet attack that heals you (#2003).",
    draw: () => clawMark(inkLine("M18 2.5V9.5M14.5 6H21.5", 2.2)),
  },
  "claw-condition": {
    means:
      "Claw gashes under a dashed ring: a pet attack that bites harder on a foe with a condition (#2003).",
    draw: () =>
      clawMark(`<circle cx="18" cy="6.2" r="3.6" ${stroke(C.ink, 1.8)} stroke-dasharray="2 1.6"/>`),
  },
  "claw-adrenaline": {
    means: "Claw gashes under two chevrons up: a pet attack that gives you adrenaline (#2003).",
    draw: () => clawMark(inkLine("M15 9.5L18 6.5L21 9.5M15 5.5L18 2.5L21 5.5", 1.8)),
  },
  "claw-enchanted": {
    means:
      "Claw gashes under a hollow rounded square, the enchantment plate: a pet attack that needs an enchantment on you (#2003).",
    draw: () =>
      clawMark(`<rect x="14.2" y="2.8" width="7" height="7" rx="2" ${stroke(C.ink, 1.7)}/>`),
  },
  "claw-recharge": {
    means:
      "Claw gashes under an hourglass: a pet attack that counts your recharging skills (#2003).",
    draw: () => clawMark(inkLine("M15 2.5H21L15 10H21Z", 1.6)),
  },
};

export default glyphs;
