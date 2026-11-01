// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, burst, strikeWith, glyph } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "dagger-limp-rider": {
    means:
      "Assassin staples 3 (#1653): the blade, with its rider on a plate in the corner. Black Mantis Thrust: cripples a hexed foe.",
    draw: () => strikeWith(inkLine("M16 1L9 10.5L15 15L7 23", 4)),
  },
  "dagger-germ": {
    means: "Black Spider Strike: poisons a hexed foe.",
    draw: () =>
      strikeWith(
        `<circle cx="12" cy="12" r="5" fill="${C.ink}"/>` +
          inkLine("M12 2V6M12 18V22M2 12H6M18 12H22M5 5L8 8M16 16L19 19M19 5L16 8M8 16L5 19", 2.6),
      ),
  },
  "dagger-unblock": {
    means: "Golden Fox Strike: unblockable while enchanted, the cracked shield of Guiding Hands.",
    draw: () => strikeWith(glyph("armor-crack")),
  },
  "dagger-low": {
    means:
      "Assassin staples 5 (#1775). The blade with a nearly empty gauge: the bonus comes when you are hurt.",
    draw: () =>
      strikeWith(
        `<rect x="6.500" y="3" width="11" height="18" rx="2" ${stroke(C.ink, 2.6)}/>` +
          inkFill("M8 16.500H16V20H8Z"),
      ),
  },
  "dagger-repeat": {
    means: "The blade with a circling arrow: the off-hand strike that comes round again.",
    draw: () =>
      strikeWith(`<path d="M19 9A8 8 0 1 0 20 13" ${stroke(C.ink, 3)}/>` + inkFill("M22 2V10H14Z")),
  },
  "dagger-spikes": {
    means: "The blade with spikes rising out of the ground: earth damage and a wound.",
    draw: () => strikeWith(inkLine("M1 21L6 5L11 21L16 5L21 21", 3.4), true),
  },
  "dagger-wound": {
    means: "Golden Fang Strike: Deep Wound while enchanted, the cross of the status.",
    draw: () => strikeWith(inkLine("M5 5L19 19M19 5L5 19", 4)),
  },
  "dagger-energy": {
    means: "Lotus Strike: gives Energy.",
    draw: () => strikeWith(glyph("energy")),
  },
  "dagger-energy-ground": {
    means: "Falling Lotus Strike: Energy from a foe on the ground.",
    draw: () => strikeWith(glyph("energy") + inkLine("M1 22H23", 3)),
  },
  "daggers-unblock": {
    means: "Nine Tail Strike: two blows, neither can be blocked.",
    draw: () => strikeWith(glyph("armor-crack"), true),
  },
  "dagger-interrupt-down": {
    means: "Disrupting Stab: interrupts, the spell disabled behind it.",
    draw: () => strikeWith(glyph("interrupt") + inkLine("M12 15V23M8 20L12 23.5L16 20", 3)),
  },
  "dagger-interrupt-blind": {
    means: "Temple Strike: interrupts, and blinds.",
    draw: () =>
      strikeWith(
        `<g transform="translate(11,13) scale(0.8) translate(-12,-12)">${glyph("eye-slash")}</g>` +
          `<g transform="translate(19,5) scale(0.42) translate(-12,-12)">${glyph("interrupt")}</g>`,
      ),
  },
  "daggers-drop": {
    means: "Vampiric Assault: two blows that drink.",
    draw: () => strikeWith(inkFill("M12 2C9 7 6 10 6 15a6 6 0 0 0 12 0C18 10 15 7 12 2Z"), true),
  },
  "daggers-ring": {
    means: "Shattering Assault: two blows that break an enchantment.",
    draw: () => strikeWith(glyph("ring-rend"), true),
  },
  scythe: {
    means: "A scythe: a long haft, the blade curved over its top (#990).",
    draw: () =>
      inkLine("M7 21L16 6", 2.4) + inkFill("M16 6C12 2.5 7 3 3.5 6.5C8 5.5 11.5 6.5 14.5 9Z"),
  },
  "scythe-spend": {
    means: "A scythe with a broken ring beside its blade: it spends an enchantment (#1573).",
    draw: () =>
      inkLine("M6 21L14 7", 2.4) +
      inkFill("M14 7C10.5 3.5 6 4 2.5 7.5C6.5 6.5 10 7.5 12.5 10Z") +
      `<path d="M17 3.2A4.2 4.2 0 0 1 21.4 7.6M21 11.2A4.2 4.2 0 0 1 16.4 11.4" ${stroke(C.ink, 1.8)}/>`,
  },
  "scythe-unblock": {
    means:
      "Dervish staples 2 (#1604): the sweeps are one scythe with three riders; the rest take their statuses' shapes. A scythe over an arrow: the blow cannot be blocked, as Guiding Hands' arrow says (#1645).",
    draw: () =>
      inkLine("M6 20L13 7", 2.4) +
      inkFill("M13 7C9.5 3.5 5 4 1.5 7.5C5.5 6.5 9 7.5 11.5 10Z") +
      inkLine("M14 19.5H22M19.5 17L22 19.5L19.5 22", 2),
  },
  "scythe-limp": {
    means: "A scythe with a crack in the corner: the foes it hits are crippled (#1645).",
    draw: () =>
      inkLine("M6 21L14 7", 2.4) +
      inkFill("M14 7C10.5 3.5 6 4 2.5 7.5C6.5 6.5 10 7.5 12.5 10Z") +
      inkLine("M20 2L16.5 6L20 9L17 13", 2.2),
  },
  "scythe-rend": {
    means: "A scythe with a ring struck through: the enchantment torn off the foe (#1645).",
    draw: () =>
      inkLine("M6 21L14 7", 2.4) +
      inkFill("M14 7C10.5 3.5 6 4 2.5 7.5C6.5 6.5 10 7.5 12.5 10Z") +
      `<circle cx="18.5" cy="7" r="3.6" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M15 11L22 3", 2),
  },
  "scythe-purge": {
    means:
      "Dervish staples 3 (#1707): scythes with a rider, and the enchantments' shapes their statuses repeat. A scythe over a drop struck through: it strips a condition.",
    draw: () =>
      inkLine("M6 21L14 7", 2.4) +
      inkFill("M14 7C10.5 3.5 6 4 2.5 7.5C6.5 6.5 10 7.5 12.5 10Z") +
      inkFill("M19 3c1.6 2.3 2.8 3.4 2.8 5a2.8 2.8 0 0 1-5.6 0c0-1.6 1.2-2.7 2.8-5z") +
      inkLine("M15.5 11.5L22.5 3.5", 1.6),
  },
  "scythe-limp-star": {
    means: "A scythe with a crack and a star: the crippling blow that finishes.",
    draw: () =>
      inkLine("M6 21L14 7", 2.4) +
      inkFill("M14 7C10.5 3.5 6 4 2.5 7.5C6.5 6.5 10 7.5 12.5 10Z") +
      inkLine("M21 11L18 14L21 17L18.5 20.5", 2.2) +
      inkFill("M18 1.5L19.2 4.3L22 5.5L19.2 6.7L18 9.5L16.8 6.7L14 5.5L16.8 4.3Z"),
  },
  "scythe-burst": {
    means: "A scythe with a burst in the corner: the blow that interrupts.",
    draw: () =>
      inkLine("M6 21L14 7", 2.4) +
      inkFill("M14 7C10.5 3.5 6 4 2.5 7.5C6.5 6.5 10 7.5 12.5 10Z") +
      inkLine("M19 1.5V10.5M14.5 6H23.5M15.8 2.8L22.2 9.2M22.2 2.8L15.8 9.2", 1.8),
  },
  "scythe-frost": {
    means: "A scythe with a snowflake in the corner: cold damage from the blade (#1573).",
    draw: () =>
      inkLine("M6 21L14 7", 2.4) +
      inkFill("M14 7C10.5 3.5 6 4 2.5 7.5C6.5 6.5 10 7.5 12.5 10Z") +
      inkLine("M19 2.5V10.5M15.5 4.5L22.5 8.5M22.5 4.5L15.5 8.5", 1.6),
  },
  dagger: {
    means: "dagger",
    draw: () =>
      inkLine("M8 16L18.5 5.5", 2.8) +
      inkLine("M5.5 13.5L10.5 18.5", 2.2) +
      inkLine("M4 20l2.5-2.5", 2.4),
  },
  "dagger-burst": {
    means:
      "A blade with rays bursting from its point: the cripple spreads to those beside it (#1049).",
    draw: () =>
      inkLine("M4.5 19.5L13 11", 2.6) +
      inkLine("M17 3V6.5M21 7H17.5M19.5 10.5L17 8.5M10.5 5L12.5 7.5M20 3.5L18 5.5", 2) +
      inkFill("M13 11L17 7L15 12.5Z"),
  },
  "dagger-crit": {
    means: "A dagger with a four-point spark at its point: the blow is a critical hit (#1315).",
    draw: () =>
      inkLine("M8 16L14 10", 2.8) +
      inkLine("M5.5 13.5L10.5 18.5", 2.2) +
      inkLine("M4 20l2.5-2.5", 2.4) +
      inkFill("M17 2.5L18.6 7.4L23.5 9L18.6 10.6L17 15.5L15.4 10.6L10.5 9L15.4 7.4Z"),
  },
  claw: {
    means: "Three gashes: a claw, a strike that tears (#1215).",
    draw: () => inkLine("M5.5 4L9.5 20M10.5 4L13 15M15.5 4L18 11", 2.6),
  },
  "scythe-stretch": {
    means: "Extend Enchantments: a scythe whose aura is drawn out into a long dashed ellipse.",
    draw: () =>
      inkLine("M6 17L9.5 2.5", 2.4) +
      inkFill("M9.5 2.5C17 1.5 22.5 5.5 22.5 11C18.5 8 14.5 7.5 9 9Z") +
      inkLine("M5 21.5H22.5M19.5 18.8L22.5 21.5L19.5 24.2", 2),
  },
  "dagger-pair": {
    means: "Dancing Daggers (#1914): two daggers in flight, one behind the other.",
    draw: () =>
      inkLine("M4 14L12 6", 2.4) +
      inkLine("M3 9L9 15", 2) +
      inkLine("M10 21L19 12", 2.4) +
      inkLine("M9 16L15 22", 2),
  },
  "dagger-stop": {
    means: "A thrown dagger and a star where it lands: the cast is broken (#1262).",
    draw: () =>
      inkLine("M3 20L12 11", 2.6) +
      inkFill("M12 11L15.5 7.5L13.8 13.2Z") +
      `<g transform="translate(17.5,6.5) scale(0.5) translate(-12,-12)">${inkFill(burst(6))}</g>`,
  },
  "dagger-limp": {
    means: "A thrown dagger and a limping line beyond it: the foe is slowed (#1262).",
    draw: () =>
      inkLine("M3 20L12 11", 2.6) +
      inkFill("M12 11L15.5 7.5L13.8 13.2Z") +
      inkLine("M19 3L16.5 7L20 10L17.5 13", 2.2),
  },
  "claw-crack": {
    means: "A three-toed print over a crack: the dragon's stomp.",
    draw: () =>
      `<ellipse cx="6" cy="6.5" rx="2" ry="3" fill="${C.ink}"/><ellipse cx="12" cy="5" rx="2" ry="3.2" fill="${C.ink}"/><ellipse cx="18" cy="6.5" rx="2" ry="3" fill="${C.ink}"/>` +
      inkLine("M2 15H8L10 21M22 15H16L14 21", 2.4) +
      inkLine("M12 10V15", 2.4),
  },
  "claws-rampage": {
    means: "Three curved claw marks side by side: a rampage of quick strikes.",
    draw: () =>
      inkLine("M4 4C7 9 7 15 4 20", 2.4) +
      inkLine("M11 3C14 9 14 15 11 21", 2.4) +
      inkLine("M18 4C21 9 21 15 18 20", 2.4),
  },
  "fangs-poison": {
    means: "Two fangs over three bubbles.",
    draw: () =>
      inkFill("M4 3H10L7 13Z") +
      inkFill("M14 3H20L17 13Z") +
      `<circle cx="7" cy="18" r="2.3" fill="${C.ink}"/><circle cx="12.5" cy="20" r="1.8" fill="${C.ink}"/><circle cx="17.5" cy="18" r="2.3" fill="${C.ink}"/>`,
  },
  "dagger-lotus": {
    means: "Golden Lotus Strike: a blade over an open lotus (#1617).",
    draw: () =>
      `<g transform="translate(6,-2.5) scale(0.62)">${glyph("dagger")}</g>` +
      inkFill("M12 21.5C9.5 18 9.5 13.5 12 10C14.5 13.5 14.5 18 12 21.5Z") +
      inkFill("M10.5 21.5C6 21.5 2.5 19 2 14C6.5 14 9.6 16.5 10.5 21.5Z") +
      inkFill("M13.5 21.5C18 21.5 21.5 19 22 14C17.5 14 14.4 16.5 13.5 21.5Z"),
  },
  "dagger-drain": {
    means: "Exhausting Assault: a blade striking a spell star with a down arrow in it (#1617).",
    draw: () =>
      inkLine("M3 21L11 13", 2.6) +
      inkFill("M11 13L14.5 9.5L12.8 15Z") +
      `<path d="M16.5 2L18.2 6L22 7.5L18.2 9L16.5 13L14.8 9L11 7.5L14.8 6Z" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M16.5 15.5V21M14 19L16.5 21.5L19 19", 2),
  },
};

export default glyphs;
