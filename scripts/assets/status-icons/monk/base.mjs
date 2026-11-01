import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: the same plus inside a ring, health kept coming back for
  // as long as its caster maintains it (#837).
  mending: [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="7.5" ${stroke(c, 1.6)}/>` +
      `<path d="M12 8.5v7M8.5 12h7" ${stroke(c, 2.5)}/>`,
  ],
  // Enchantment: an hourglass run out into a plus, the heal waiting at
  // the end of its time (#944).
  "patient-spirit": [
    "enchantment",
    (c) =>
      `<path d="M7 5h10L7 15h10z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 15.5v4M10 17.5h4" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a veil drawn over its bearer, hexes held back (#944).
  "holy-veil": [
    "enchantment",
    (c) =>
      `<path d="M5 18c0-7 3-12 7-12s7 5 7 12" ${stroke(c, 2)}/>` +
      `<path d="M9 18c0-4 1.3-7 3-7s3 3 3 7" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a plus carried on two gusts, health on the wind (#1013).
  "healing-breeze": [
    "enchantment",
    (c) =>
      `<path d="M15 4v7M11.5 7.5h7" ${stroke(c, 2.5)}/>` +
      `<path d="M4 15.5h9a2 2 0 1 0-2-2M4 18.5h7a2 2 0 1 1-2 2" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a filled shield, a blow glancing off it.
  "shield-of-deflection": [
    "enchantment",
    (c) =>
      `<path d="M7 5.5h10v5.5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" fill="${c}"/>` +
      `<path d="M4 20L9 15" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: two cupped hands under a drop, damage taken softened.
  "shielding-hands": [
    "enchantment",
    (c) =>
      `<path d="M4 12c0 4 3.5 7 8 7s8-3 8-7" ${stroke(c, 2)}/>` +
      `<path d="M12 4c-2 3-3 4.5-3 6a3 3 0 0 0 6 0c0-1.5-1-3-3-6z" fill="${c}"/>`,
  ],
  // Enchantment: a ring with a broken spell bolt, foes' spells turned away.
  "spell-breaker": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="7.5" ${stroke(c, 1.8)}/>` +
      `<path d="M13 5l-3 6h4l-3 6" ${stroke(c, 1.8)}/><path d="M6 18L18 6" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a shield in outline with a blow glancing off it, block (#534).
  guardian: [
    "enchantment",
    (c) =>
      `<path d="M7 5.5h10v5.5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" ${stroke(c, 2)}/>` +
      `<path d="M9.5 14L15 8.5" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a shield under a line, no hit past 10% (#936).
  "protective-spirit": [
    "enchantment",
    (c) =>
      `<path d="M7 7.5h10v4c0 3-2.5 5-5 6.5C9.5 16.5 7 14.5 7 11.5z" ${stroke(c, 2)}/>` +
      `<path d="M6 4.5h12" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: an arrow turning back up, the next hit heals (#987).
  "reversal-of-fortune": [
    "enchantment",
    (c) => `<path d="M8 6v7a4 4 0 0 0 8 0V8M13 11l3-3 3 3" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a plus thrown up by two strokes, healed on each attack
  // or spell (#1039).
  "vigorous-spirit": [
    "enchantment",
    (c) =>
      `<path d="M12 5v8M8 9h8" ${stroke(c, 2.5)}/>` +
      `<path d="M6.5 18.5l3-3M17.5 18.5l-3-3" ${stroke(c, 2)}/>`,
  ],
  // Hex: a plus with rays thrown back, the enchanter is smitten (#1403).
  "scourge-enchantment": [
    "hex",
    (c) =>
      `<path d="M12 8v8M8 12h8" ${stroke(c, 2.4)}/>` +
      `<path d="M5 5l2.5 2.5M19 5l-2.5 2.5M5 19l2.5-2.5M19 19l-2.5-2.5" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a shield with a plus over regeneration chevrons, as the skill's icon.
  "shield-of-regeneration": [
    "enchantment",
    (c) =>
      `<path d="M12 2.5L19 5V10.5C19 14 16 16 12 17.5C8 16 5 14 5 10.5V5Z" ${stroke(c, 2)}/>` +
      `<path d="M12 6.5V12M9.2 9.2H14.8" ${stroke(c, 2)}/>` +
      `<path d="M4 21L7 18L10 21M9 21L12 18L15 21M14 21L17 18L20 21" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a blow struck, a plus coming back to the Monk.
  "live-vicariously": [
    "enchantment",
    (c) =>
      `<path d="M4 18L12 10M9 9l3 1 1 3" ${stroke(c, 2)}/>` +
      `<path d="M17 4v6M14 7h6" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a veil over a falling drop, conditions wearing off.
  "purifying-veil": [
    "enchantment",
    (c) =>
      `<path d="M4 8c3-4 13-4 16 0" ${stroke(c, 1.8)}/>` +
      `<path d="M12 11c-2 3-3 4.5-3 6a3 3 0 0 0 6 0c0-1.5-1-3-3-6z" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a sword struck through, the foe cannot attack.
  pacifism: [
    "hex",
    (c) =>
      `<path d="M6 18L16 8M14 6l4 4M8 20l-4-4" ${stroke(c, 2)}/>` +
      `<path d="M5 5l14 14" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: an eye over a plus, watching, healing when it ends.
  "watchful-spirit": [
    "enchantment",
    (c) =>
      `<path d="M3 9c4-5 14-5 18 0c-4 5-14 5-18 0z" ${stroke(c, 1.6)}/>` +
      `<circle cx="12" cy="9" r="1.8" ${stroke(c, 1.6)}/>` +
      `<path d="M12 14v7M8.5 17.5h7" ${stroke(c, 2.2)}/>`,
  ],
  // Monk mechanics (#1754, #1784): the enchantment icons repeat their skill's glyph.
  // Enchantment: a plus inside a ring, healed when a big hit lands.
  "spirit-bond": [
    "enchantment",
    (c) =>
      `<circle cx="8" cy="9" r="5" ${stroke(c, 2)}/><circle cx="16" cy="9" r="5" ${stroke(c, 2)}/>` +
      `<path d="M8 6.5V11.5M5.5 9H10.5M4 18L8 21.5L12 18M12.5 18L16.5 21.5L20.5 18" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a star with an arrow turned back, blows go back to the attacker.
  "holy-wrath": [
    "enchantment",
    (c) =>
      `<path d="M16 1l1.8 4.7 4.7 1.8-4.7 1.8L16 14l-1.8-4.7L9.5 7.5l4.7-1.8z" fill="${c}"/>` +
      `<path d="M13 14.5H7.5a3.2 3.2 0 0 0 0 6.4H18" ${stroke(c, 2)}/>` +
      `<path d="M22 21L17.5 18.2V23.8Z" fill="${c}"/>`,
  ],
  // Enchantment: a ring of rays round a body, adjacent foes burn holy.
  "balthazars-aura": [
    "enchantment",
    (c) =>
      `<path d="M12 6L13.7 10.3L18 12L13.7 13.7L12 18L10.3 13.7L6 12L10.3 10.3Z" fill="${c}"/>` +
      `<circle cx="12" cy="12" r="10" ${stroke(c, 2)} stroke-dasharray="3 3"/>`,
  ],
  // Ally threshold mechanics (#1789, #1817): a Health bar and the line that answers.
  // Enchantment: a haloed heart over an emptied bar, a star strikes back at the killing blow.
  "judges-intervention": [
    "enchantment",
    (c) =>
      `<ellipse cx="12" cy="3.6" rx="5" ry="1.8" ${stroke(c, 1.8)}/>` +
      `<path d="M12 16s-5.5-3.4-5.5-7a3 3 0 0 1 5.5-1.7A3 3 0 0 1 17.5 9c0 3.6-5.5 7-5.5 7z" ${stroke(c, 1.8)}/>` +
      `<rect x="3" y="18.5" width="18" height="3.5" rx="0.8" ${stroke(c, 1.8)}/>` +
      `<path d="M20 1.7L21.06 4.44L23.8 5.5L21.06 6.56L20 9.3L18.94 6.56L16.2 5.5L18.94 4.44Z" fill="${c}"/>`,
  ],
  // Death trigger (#1762, #1832): a skull and a plus, the party is healed.
  "dwaynas-sorrow": [
    "enchantment",
    (c) =>
      `<path d="M8 3.5a4.5 4.5 0 0 0-4.5 4.5c0 1.6.8 2.7 2 3.4V14H10.5V11.4c1.2-.7 2-1.8 2-3.4A4.5 4.5 0 0 0 8 3.5z" ${stroke(c, 1.8)}/>` +
      `<circle cx="6.2" cy="8" r="1.1" fill="${c}"/><circle cx="9.8" cy="8" r="1.1" fill="${c}"/>` +
      `<path d="M17.5 12v10M12.5 17h10" ${stroke(c, 2.4)}/>`,
  ],
  // Own-skill modifiers (#1761, #1855).
  // Enchantment: a halo over the energy bolt, Monk spells cost less.
  "divine-spirit": [
    "enchantment",
    (c) =>
      `<g transform="translate(5,5) scale(0.58)">` +
      `<ellipse cx="12" cy="3.8" rx="6" ry="2.2" ${stroke(c, 2.4)}/>` +
      `<path d="M13.5 7L6.5 15H11L10 22L18 12.5H13Z" fill="${c}"/>` +
      `</g>`,
  ],
  // Enchantment: a figure in a ring drawn out into an arrow, enchantments last longer.
  "blessed-aura": [
    "enchantment",
    (c) =>
      `<g transform="translate(5,5) scale(0.58)">` +
      `<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" ${stroke(c, 2.6)}/>` +
      `<circle cx="12" cy="9" r="2.4" fill="${c}"/>` +
      `<path d="M8.5 18V13.5Q12 11.2 15.5 13.5V18Z" fill="${c}"/>` +
      `<path d="M17.5 8.5H23M20.5 5.7L23.3 8.5L20.5 11.3" ${stroke(c, 2.4)}/>` +
      `</g>`,
  ],
  // Enchantment: two hands clasped under a small plus, cheaper, lesser heals.
  "healers-covenant": [
    "enchantment",
    (c) =>
      `<g transform="translate(5,5) scale(0.58)">` +
      `<path d="M2 20L8 12H13" ${stroke(c, 4)}/>` +
      `<path d="M22 20L16 12H11" ${stroke(c, 4)}/>` +
      `<circle cx="12" cy="12" r="2.6" fill="${c}"/>` +
      `<path d="M12 2.5V8.5M9 5.5H15" ${stroke(c, 2.4)}/>` +
      `</g>`,
  ],
  // Enchantment: a heavy plus with speed streaks, Healing Prayers cast faster.
  "holy-haste": [
    "enchantment",
    (c) =>
      `<g transform="translate(5,5) scale(0.58)">` +
      `<path d="M15 4V20M7.5 12H22.5" ${stroke(c, 4.6)}/>` +
      `<path d="M1.5 7H6.5M0.5 12H4M1.5 17H6.5" ${stroke(c, 2.4)}/>` +
      `</g>`,
  ],
};

export default rows;
