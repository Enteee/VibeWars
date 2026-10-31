import { stroke } from "../icon-kit.mjs";

/** @type {Readonly<Record<string, [import("../icon-kit.mjs").Category, import("../icon-kit.mjs").Glyph]>>} */
export const MONK_STATUS_ICONS = {
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
  // Monk staples (#1511), stand-ins until their art card.
  // Enchantment: three small shields, a block for everyone in earshot.
  aegis: [
    "enchantment",
    (c) =>
      `<path d="M4 6h5v3c0 2-1.2 3-2.5 4C5.2 12 4 11 4 9zM15 6h5v3c0 2-1.2 3-2.5 4-1.3-1-2.5-2-2.5-4z" ${stroke(c, 1.6)}/>` +
      `<path d="M9.5 12h5v3c0 2-1.2 3-2.5 4-1.3-1-2.5-2-2.5-4z" ${stroke(c, 1.6)}/>`,
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
  // Monk smiting staples (#1519), a stand-in until the asset-designer's.
  // Enchantment: a blade with a holy halo, attacks are holy and pierce.
  "judges-insight": [
    "enchantment",
    (c) =>
      `<ellipse cx="12" cy="5" rx="4.5" ry="1.6" ${stroke(c, 1.5)}/>` +
      `<path d="M12 8v9M9 14h6M12 17v3" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a shield with a plus over regeneration chevrons, as the skill's icon.
  "shield-of-regeneration": [
    "enchantment",
    (c) =>
      `<path d="M12 2.5L19 5V10.5C19 14 16 16 12 17.5C8 16 5 14 5 10.5V5Z" ${stroke(c, 2)}/>` +
      `<path d="M12 6.5V12M9.2 9.2H14.8" ${stroke(c, 2)}/>` +
      `<path d="M4 21L7 18L10 21M9 21L12 18L15 21M14 21L17 18L20 21" ${stroke(c, 1.8)}/>`,
  ],
  // Monk staples 6 (#1748), stand-ins until their art card.
  // Enchantment: a plus fed by a blade's arc, the caster heals on hits.
  "live-vicariously": [
    "enchantment",
    (c) =>
      `<path d="M12 4v8M8 8h8" ${stroke(c, 2.4)}/>` +
      `<path d="M4 20C8 15 16 15 20 20" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a veil over two drops, conditions run out faster.
  "purifying-veil": [
    "enchantment",
    (c) =>
      `<path d="M4 8C8 4 16 4 20 8" ${stroke(c, 2)}/>` +
      `<path d="M9 11l-2 4a2 2 0 0 0 4 0zM16 11l-2 4a2 2 0 0 0 4 0z" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a struck-through blade, the foe cannot attack.
  pacifism: [
    "hex",
    (c) =>
      `<path d="M6 18L16 8M14 6l4 4M6 14l4 4" ${stroke(c, 2)}/>` +
      `<path d="M4 4L20 20" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: an eye over a plus, regeneration and a heal at its end.
  "watchful-spirit": [
    "enchantment",
    (c) =>
      `<path d="M3 9c3-4 6-5.5 9-5.5s6 1.5 9 5.5c-3 4-6 5.5-9 5.5s-6-1.5-9-5.5z" ${stroke(c, 1.6)}/>` +
      `<circle cx="12" cy="9" r="2" fill="${c}"/><path d="M12 16v6M9 19h6" ${stroke(c, 2)}/>`,
  ],
};
