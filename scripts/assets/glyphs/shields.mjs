// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, blockShield, burst, ringDot, barStubs, glyph } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "ring-rot": {
    means: "A ring broken open round a falling arrow: the enchantment turned to rot.",
    draw: () =>
      `<path d="M7.5 5A8 8 0 1 0 16.5 5" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M12 3V13M8.5 10L12 13.5L15.5 10", 2.4),
  },
  "ring-steal": {
    means: "A ring broken open round a drop: the enchantment stripped, health taken.",
    draw: () =>
      `<path d="M12 2.5A9.5 9.5 0 0 1 21.5 12M19 18A9.5 9.5 0 0 1 8 21M4.5 17A9.5 9.5 0 0 1 4.5 7" ${stroke(C.ink, 2)}/>` +
      inkFill("M12 6.5c2 2.8 3.5 4.5 3.5 6.5a3.5 3.5 0 0 1-7 0c0-2 1.5-3.7 3.5-6.5z"),
  },
  "shield-glance": {
    means: "A shield with a slash glancing off it: Bladeturn Refrain (#1524).",
    draw: () =>
      `<path d="M9.5 6h11v7c0 4-3 6.5-5.5 8-2.5-1.5-5.5-4-5.5-8z" ${stroke(C.ink, 2)}/>` +
      inkLine("M2.5 5L7.5 10", 2.2) +
      inkLine("M7.5 10L7 7.5M7.5 10L10 10.5", 1.8),
  },
  "ring-rip-bleed": {
    means: "A broken ring with a bleeding drop: the enchantment ripped out, the foe bleeds.",
    draw: () =>
      `<g transform="translate(10,10) scale(0.8) translate(-12,-12)">${glyph("ring-rend")}</g>` +
      inkFill(
        "M18.5 13.500c1.6 2.3 2.8 3.6 2.8 5.200a2.8 2.8 0 0 1-5.6 0c0-1.6 1.2-2.9 2.8-5.200z",
      ),
  },
  "shield-haze": {
    means: "A shield seen through a heat haze: a block chance (#1645).",
    draw: () =>
      `<path d="M12 3L19 5.5V11C19 15.5 15.5 19 12 21C8.5 19 5 15.5 5 11V5.5Z" ${stroke(C.ink, 2)}/>` +
      inkLine("M8.5 9.5Q10.2 8 12 9.5T15.5 9.5M8.5 14Q10.2 12.5 12 14T15.5 14", 1.8),
  },
  "ring-slice": {
    means: "A ring cut clean through by one long slash: the aura sliced away.",
    draw: () =>
      `<path d="M12 3.5A8.5 8.5 0 0 1 20.5 12M18 18A8.5 8.5 0 0 1 8 20M5 17A8.5 8.5 0 0 1 5 7" ${stroke(C.ink, 2)}/>` +
      inkLine("M3 21L21 3", 2.8),
  },
  "ring-rend": {
    means: "A ring broken open round a six-armed burst: cold that rends the enchantment (#1573).",
    draw: () =>
      `<path d="M12 2.5A9.5 9.5 0 0 1 21.5 12M19 18A9.5 9.5 0 0 1 8 21M4.5 17A9.5 9.5 0 0 1 4.5 7" ${stroke(C.ink, 2)}/>` +
      inkLine("M12 6.5V17.5M7.2 9.2L16.8 14.8M7.2 14.8L16.8 9.2", 2.2),
  },
  plaster: {
    means: "A sticking plaster: bound wounds, body and soul (#962).",
    draw: () =>
      `<rect x="2" y="7.5" width="20" height="9" rx="3" transform="rotate(-45 12 12)" fill="${C.ink}"/>` +
      `<rect x="8.5" y="7.5" width="7" height="9" transform="rotate(-45 12 12)" fill="${C.bg}" fill-opacity="0.45"/>` +
      `<circle cx="9.5" cy="9.5" r="0.9" fill="${C.bg}"/><circle cx="14.5" cy="14.5" r="0.9" fill="${C.bg}"/>`,
  },
  "shield-crit": {
    means: "A shield with the critical spark in it: blocks, renewed by critical hits (#1315).",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2)}/>` +
      inkFill("M12 6.5L13.7 10.3L17.5 12L13.7 13.7L12 17.5L10.3 13.7L6.5 12L10.3 10.3Z"),
  },
  "shield-stance": {
    means: "A solid shield: the block stance that pays energy (#1329).",
    draw: () => inkFill("M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z"),
  },
  "shield-bar": {
    means: "A shield outline with one bold bar: the short, plain block (#1329).",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.8)}/>` +
      inkLine("M8 11.5H16", 3.4),
  },
  "shield-arrow": {
    means: "A shield with an arrow glancing off it: projectiles deflected (#1329).",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.8)}/>` +
      inkLine("M2.5 3L11 9.5", 3) +
      inkFill("M16 13.5L8.5 13L11.5 7Z"),
  },
  "shield-blade": {
    means: "A shield with a blade across it: the blocked attacker is cut (#1329).",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.8)}/>` +
      inkLine("M7.5 17L17 7.5", 3.4) +
      inkLine("M8 10.5L13.5 16", 2.8),
  },
  "shield-bolt": {
    means: "A shield with a bolt in it: fast and hard to hit (#981).",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2)}/>` +
      inkFill("M13 6L8.5 13H12L11 18L15.5 11H12Z"),
  },
  "ring-heal": {
    means: "A heal cross inside the enchantment's ring: the ring is spent for health (#1214).",
    draw: () =>
      `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2)}/>` +
      inkFill("M10.4 7.5h3.2v2.9h2.9v3.2h-2.9v2.9h-3.2v-2.9H7.5v-3.2h2.9z"),
  },
  "shield-veil": {
    means:
      "A crescent inside a broken shield outline: a calm that ends when the blow lands (#1349).",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5" ${stroke(C.ink, 2)}/>` +
      `<path d="M12 2.5L4 5.5V12C4 16.5 7.5 19.5 12 21.5" ${stroke(C.ink, 2)} stroke-dasharray="3 3"/>` +
      inkFill("M13 7a5 5 0 1 0 0 9a4 4 0 0 1 0-9z"),
  },
  "ring-spell-heal": {
    means: "Aura of Restoration: a plus in a ring, a spark above it for each spell.",
    draw: () =>
      `<circle cx="12" cy="14" r="7.5" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M12 10.5V17.5M8.5 14H15.5", 2.2) +
      `<g transform="translate(12,3.8) scale(0.4) translate(-12,-12)">${glyph("energy")}</g>`,
  },
  "armor-spin": {
    means: "Kinetic Armor: a shield and a circling arrow, renewed by each spell.",
    draw: () =>
      glyph("armor") +
      `<path d="M8.2 11.5A4 4 0 1 1 12 16" fill="none" stroke="${C.bg}" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="M5.8 11.5L8.2 8.8L10.6 11.8Z" fill="${C.bg}"/>`,
  },
  "ring-figure-arrow": {
    means: "Blessed Aura: a figure inside a ring, with the ring's open end drawn out as an arrow.",
    draw: () =>
      `<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" ${stroke(C.ink, 2)}/>` +
      `<circle cx="12" cy="9" r="2.4" fill="${C.ink}"/>` +
      inkFill("M8.5 18V13.5Q12 11.2 15.5 13.5V18Z") +
      inkLine("M17.5 8.5H23M20.5 5.7L23.3 8.5L20.5 11.3", 1.8),
  },
  "ring-rend-burst": {
    means:
      "Pain of Disenchantment: the broken enchantment ring round a burst that reaches the foes beside it.",
    draw: () =>
      `<path d="M12 2.5A9.5 9.5 0 0 1 21.5 12M19 18A9.5 9.5 0 0 1 8 21M4.5 17A9.5 9.5 0 0 1 4.5 7" ${stroke(C.ink, 2)}/>` +
      `<g transform="translate(12,12) scale(0.7) translate(-12,-12)">${inkFill(burst(8))}</g>`,
  },
  "shield-regen": {
    means: "A shield with a plus over regeneration chevrons, which the status icon repeats.",
    draw: () =>
      `<path d="M12 2.5L19 5V10.5C19 14 16 16 12 17.5C8 16 5 14 5 10.5V5Z" ${stroke(C.ink, 2)}/>` +
      inkLine("M12 6.5V12M9.2 9.2H14.8", 2) +
      inkLine("M4 21L7 18L10 21M9 21L12 18L15 21M14 21L17 18L20 21", 1.8),
  },
  "plate-post": {
    means: "Armor of Unfeeling (#1874): an armour plate with a binding post cut out of it.",
    draw: () =>
      `<path fill-rule="evenodd" fill="${C.ink}" d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5ZM9.6 8.6a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0ZM10 12.2H14L14.7 17H9.3Z"/>`,
  },
  "ward-blade": {
    means: "The ward's ring and pole, with a blade struck from it: it turns melee (#1217).",
    draw: () =>
      `<ellipse cx="12" cy="17" rx="8.5" ry="4" ${stroke(C.ink, 2.5)}/>` +
      inkLine("M12 17V9", 2.5) +
      inkLine("M5 3.5L11 9.5M19 3.5L13 9.5", 2.2),
  },
  "ring-rays": {
    means: "A ring on the ground and light thrown up out of it: a symbol laid down (#1217).",
    draw: () =>
      `<ellipse cx="12" cy="17" rx="9" ry="4.2" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M12 3.5V12M6 6L8.5 12M18 6L15.5 12", 2.4),
  },
  armor: {
    means: "Shield.",
    draw: () => inkFill("M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z"),
  },
  "armor-half": {
    means: "A shield hollow above, filled below: it holds when Health is low (#1001).",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2)}/>` +
      inkFill("M4 13H20C19 17 16 19.5 12 21.5C8 19.5 5 17 4 13Z"),
  },
  "bars-rise": {
    means: "Rising adrenaline bars under a chevron: adrenaline gained faster.",
    draw: () => inkLine("M5 21V16M11 21V11M17 21V6", 3.2) + inkLine("M14 3.5L18 1.5L22 3.5", 1.8),
  },
  "bar-daze": {
    means: "A foe laid flat under a dizzy spiral and stars: Awe knocks down and dazes.",
    draw: () =>
      inkLine("M2.5 20H21.5", 3.2) +
      `<path d="M12 11a1.6 1.6 0 1 1 1.6-1.6 3.4 3.4 0 1 1-3.4-3.4 5.2 5.2 0 1 1 5.2 5.2" ${stroke(C.ink, 2)}/>` +
      inkFill("M4.5 3L5.4 5.1L7.5 6L5.4 6.9L4.5 9L3.6 6.9L1.5 6L3.6 5.1Z") +
      inkFill("M19.5 3L20.4 5.1L22.5 6L20.4 6.9L19.5 9L18.6 6.9L16.5 6L18.6 5.1Z"),
  },
  "block-half": {
    means:
      "The Monk staples (#1541). A shield filled to the share it blocks: half for the party's Aegis, three quarters for the one ally Shield of Deflection guards; dots above are the party.",
    draw: () =>
      inkLine("M7 3H8M12 3h0M16 3h1", 2.4) +
      `<g transform="translate(2.4,3.4) scale(0.8)">${blockShield("M12 2.5L4 5.5V12C4 16.5 7.5 19.5 12 21.5Z")}</g>`,
  },
  "block-most": {
    means: "block most",
    draw: () =>
      `<g transform="translate(2.4,2.4) scale(0.8)">${blockShield("M12 2.5L20 5.5V12.5H12V21.5C7.5 19.5 4 16.5 4 12V5.5Z")}</g>`,
  },
  "shield-cut-heal": {
    means: "A shield with a minus over a plus: each hit cut, and a heal at the end.",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M8.6 9H15.4", 2.2) +
      inkLine("M12 12V17M9.5 14.5H14.5", 2.2),
  },
  "armor-crack": {
    means: "A shield outline with a crack down its face: the block is gone (#1262).",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2)}/>` +
      inkLine("M12 5.5L9.5 10.5L14 13L11 18.5", 2.4),
  },
  "armor-shrink": {
    means: "A shield inside its own outline: armor drawing in, cracked when it ends (#1243).",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 1.8)} stroke-dasharray="3.4 2.4"/>` +
      inkFill("M12 7L16 8.6V12.4C16 14.6 14.4 16 12 17.2C9.6 16 8 14.6 8 12.4V8.6Z"),
  },
  "ward-elements": {
    means: "Ward Against Elements: the ward's ring and pole, a flame and a bolt above (#1572).",
    draw: () =>
      `<ellipse cx="12" cy="18" rx="8.5" ry="3.6" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M12 18V12", 2.4) +
      `<g transform="translate(6.5,7) scale(0.5) translate(-12,-12)">${glyph("flame")}</g>` +
      inkLine("M18 1.5L15 7H19L16 12.5", 2),
  },
  "ring-shock": {
    means: "Rings spreading from the caster with ticks leaping off them.",
    draw: () =>
      `<ellipse cx="12" cy="15" rx="4" ry="1.8" fill="${C.ink}"/>` +
      `<ellipse cx="12" cy="15" rx="9" ry="4.5" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M12 2.5V8M4 6L6.5 9.5M20 6L17.5 9.5", 2.2),
  },
  "ward-slow": {
    means: "Ward Against Foes: the ward's ring and pole, a dragging trail of bars (#1605).",
    draw: () =>
      `<ellipse cx="12" cy="18" rx="8.5" ry="3.6" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M12 18V13", 2.4) +
      inkLine("M12 3.5H21M7 7.5H21M3 11.5H21", 2.4),
  },
  "ward-block": {
    means: "Ward of Stability: the ward's ring and pole, a planted block on top (#1605).",
    draw: () =>
      `<ellipse cx="12" cy="18" rx="8.5" ry="3.6" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M12 18V10", 2.4) +
      inkFill("M5.5 2.5H18.5V9H5.5Z"),
  },
  "shield-whirl": {
    means: "A shield with a turning arc round it.",
    draw: () =>
      `<g transform="translate(12,12) scale(0.6) translate(-12,-12)">${glyph("shield-stance")}</g>` +
      `<path d="M20.5 12A8.5 8.5 0 1 1 12 3.5" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M12 0.5L16 3.5L12 6.5Z"),
  },
  "shield-frenzy": {
    means: "A shield with a bolt cut out of it: a wild block that costs you.",
    draw: () =>
      inkFill("M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z") +
      `<path d="M13.5 6L8.5 13H12L10.5 18.5L15.5 11H12Z" fill="${C.bg}"/>`,
  },
  "ring-mountain": {
    means: "A ring around a mountain: an aura that keeps you standing.",
    draw: () =>
      `<circle cx="12" cy="12" r="9.5" ${stroke(C.ink, 1.8)}/>` +
      `<g transform="translate(12,12) scale(0.62) translate(-12,-12)">${inkFill("M2 20L9.5 6L13.5 13L16.5 9L22 20Z")}</g>`,
  },
  "ring-healers": {
    means: "Four plus signs around an empty centre: heals all around, never the caster.",
    draw: () =>
      inkLine("M12 1.5V8.5M8.5 5H15.5", 2.4) +
      inkLine("M12 15.5V22.5M8.5 19H15.5", 2.4) +
      inkLine("M1.5 12H8.5M5 8.5V15.5", 2.4) +
      inkLine("M15.5 12H22.5M19 8.5V15.5", 2.4) +
      `<circle cx="12" cy="12" r="2" ${stroke(C.ink, 1.6)}/>`,
  },
  "shield-flame": {
    means: "A filled shield with a flame cut out of it: protection from elements.",
    draw: () =>
      inkFill("M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z") +
      `<g transform="translate(12,12.5) scale(0.5) translate(-12,-12)"><path d="M14 3c.6 4 5 6 5 11a7 7 0 0 1-14 0c0-3 1.2-5.2 3-6.4 0 2.3.6 3.5 1.8 4.1-.6-3.5 1.2-7 4.2-8.7z" fill="${C.bg}"/></g>`,
  },
  "shield-blow": {
    means: "A filled shield with a sword cut out of it: protection from blows.",
    draw: () =>
      inkFill("M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z") +
      `<path d="M7.5 16.5L16 8M9.5 9.5L14.5 14.5" ${stroke(C.bg, 2.4)}/>`,
  },
  "ring-heart": {
    means: "A heart inside a ring: an enchantment that adds to your Health.",
    draw: () =>
      `<circle cx="12" cy="12" r="9.5" ${stroke(C.ink, 1.8)}/>` +
      `<path d="M12 18s-6-3.7-6-7.7A3.3 3.3 0 0 1 12 8.5 3.3 3.3 0 0 1 18 10.3c0 4-6 7.7-6 7.7z" fill="${C.ink}"/>`,
  },
  "bars-wail": {
    means: "Three attribute bars cut to stubs, and a wail or a wilt above them (#1946).",
    draw: () =>
      barStubs() + inkLine("M8 8A6 6 0 0 1 8 2M12 9.5A9 9 0 0 1 12 .5M16 8A6 6 0 0 0 16 2", 1.8),
  },
  "bars-wilt": {
    means: "bars wilt",
    draw: () => barStubs() + inkLine("M6 3L12 9L18 3M6 8.5L12 14.5L18 8.5", 2),
  },
  "bars-set": {
    means: "Three bars of one height under a ceiling: an attribute set to a rank (#1946).",
    draw: () =>
      inkFill("M3 8H8V20H3ZM9.5 8H14.5V20H9.5ZM16 8H21V20H16Z") + inkLine("M2.5 4H21.5", 2),
  },
  "bars-lent": {
    means: "A ringed dot lends its rank to the tallest bar (#1946).",
    draw: () =>
      inkFill("M11 14H15V20H11ZM17 6H21V20H17Z") +
      ringDot(5, 12, 3.4) +
      inkLine("M9 9H14.5M12.5 6.5L15 9L12.5 11.5", 1.8),
  },
  "shield-knock": {
    means: "Warrior staples 2 and Clumsiness (#1592, #1593, #1619).",
    draw: () =>
      `<g transform="translate(9,12) scale(0.8) translate(-12,-12)"><path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.8)}/></g>` +
      `<g transform="translate(18.5,6) scale(0.5) translate(-12,-12)">${glyph("interrupt")}</g>` +
      inkLine("M17 14L21 20", 2.2),
  },
  "shield-less": {
    means: "A shield with a down chevron for less damage.",
    draw: () =>
      `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.8)}/>` +
      inkLine("M12 7.5V15M8.5 12L12 15.5L15.5 12", 2.8),
  },
};

export default glyphs;
