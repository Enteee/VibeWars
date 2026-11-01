import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Glyph: a bolt, your next spells cost less energy (#526).
  "glyph-of-lesser-energy": [
    "glyph",
    (c) => `<path d="M13.5 4.5L8.5 11h3.5l-1.5 5 5-6.5H12z" fill="${c}"/>`,
  ],
  // Glyphs on the next spell (#1730), the skills' shapes: a bolt sealed in
  // a ring, a bolt and an hourglass, a bolt in a circling arrow, a bolt
  // over a drained bar.
  "glyph-of-concentration": [
    "glyph",
    (c) =>
      `<g transform="translate(12 9) scale(0.68) translate(-12 -12)">` +
      `<circle cx="12" cy="12" r="9" ${stroke(c, 3.1)}/>` +
      `<path d="M13.5 5.5L8.5 12.5h3.5l-1.5 6 5.5-8h-3.5z" fill="${c}"/>` +
      `</g>`,
  ],
  "glyph-of-sacrifice": [
    "glyph",
    (c) =>
      `<g transform="translate(12 9) scale(0.68) translate(-12 -12)">` +
      `<path d="M9.5 3.5L4 12.5h4l-1.5 8 6-9.5h-4z" fill="${c}"/>` +
      `<path d="M14.5 5h5M14.5 18h5M15.5 5l3 6.5-3 6.5M18.5 5l-3 6.5 3 6.5" ${stroke(c, 2.2)}/>` +
      `</g>`,
  ],
  "glyph-of-renewal": [
    "glyph",
    (c) =>
      `<g transform="translate(12 9) scale(0.68) translate(-12 -12)">` +
      `<path d="M19 7.5A8.5 8.5 0 1 0 20.5 13" ${stroke(c, 3.1)}/>` +
      `<path d="M22 2.5V9H15.5z" fill="${c}"/>` +
      `<path d="M13 6.5L9 12.5h3l-1 5 4.5-6.5h-3z" fill="${c}"/>` +
      `</g>`,
  ],
  "glyph-of-essence": [
    "glyph",
    (c) =>
      `<g transform="translate(12 9) scale(0.68) translate(-12 -12)">` +
      `<path d="M13 3L7.5 12h4l-1.5 5 6-8h-4z" fill="${c}"/>` +
      `<rect x="7.5" y="18" width="9" height="3" rx="1" ${stroke(c, 2.5)}/>` +
      `<path d="M8.5 19h2.5v1H8.5z" fill="${c}"/>` +
      `</g>`,
  ],
  // Enchantment: a small shield.
  "armor-boost": [
    "enchantment",
    (c) => `<path d="M7 6h10v5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" fill="${c}"/>`,
  ],
  // Hex: an ice shard, the cold slowing you (#918).
  "shard-storm": ["hex", (c) => `<path d="M12 5.5L15 12L12 18.5L9 12z" fill="${c}"/>`],
  // Hex: three ice spikes falling, the cold slowing you (#938).
  "ice-spikes": [
    "hex",
    (c) =>
      `<path d="M7.5 7l1.5 10 1.5-10zM10.5 7l1.5 11 1.5-11zM13.5 7l1.5 10 1.5-10z" fill="${c}"/>`,
  ],
  // Hex: a snowflake, the ground frozen under you (#938).
  "deep-freeze": ["hex", (c) => `<path d="M12 6v12M6.8 9l10.4 6M6.8 15l10.4-6" ${stroke(c, 2)}/>`],
  // Skill effect: a shield on a ground line, melee blocked inside a ward (#1087).
  "ward-against-melee": [
    "skill-effect",
    (c) =>
      `<path d="M8 5.5h8v4.5c0 2.5-2 4.2-4 5.5-2-1.3-4-3-4-5.5z" ${stroke(c, 2)}/>` +
      `<path d="M5 18.5h14" ${stroke(c, 2.2)}/>`,
  ],
  // Hex: icicles under a bar, the cage that slows 66% (#1367, #1440).
  "ice-prison": [
    "hex",
    (c) =>
      `<path d="M4 5h16" ${stroke(c, 2)}/>` +
      `<path d="M5.5 6.5h4L7.5 18zM10 6.5h4L12 19zM14.5 6.5h4L16.5 18z" fill="${c}"/>`,
  ],
  // Hex: a snowflake with ice thrown out round it, the burst round the caster (#1367, #1440).
  "frozen-burst": [
    "hex",
    (c) =>
      `<path d="M12 8v8M8.5 10l7 4M8.5 14l7-4" ${stroke(c, 1.8)}/>` +
      `<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a spear point over a plus, regeneration while Overcast (#1367).
  "ice-spear": [
    "skill-effect",
    (c) =>
      `<path d="M12 4l2.5 5h-5z" fill="${c}"/>` +
      `<path d="M12 9v5M12 15v5M9.5 17.5h5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: an eye and its ghost, half the attacks miss (#1367, #1440).
  "blurred-vision": [
    "hex",
    (c) =>
      `<path d="M3 12c2-3.5 4.5-5 7.5-5s5.5 1.5 7.5 5c-2 3.5-4.5 5-7.5 5S5 15.5 3 12z" ${stroke(c, 1.8)}/>` +
      `<circle cx="10.5" cy="12" r="2" fill="${c}"/>` +
      `<path d="M21 12c-1.4-2.4-2.8-3.8-4.4-4.6" ${stroke(c, 1.4)} stroke-dasharray="1.6 1.8"/>`,
  ],
  // Enchantment: a shield with mist lines across it, armor and speed (#1367, #1440).
  "armor-of-mist": [
    "enchantment",
    (c) =>
      `<path d="M12 3.5l6.5 2.5v5.5c0 3.8-2.8 6.2-6.5 8-3.7-1.8-6.5-4.2-6.5-8V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M8.5 10c1.2-1.4 2.3-1.4 3.5 0s2.3 1.4 3.5 0M8.5 14c1.2-1.4 2.3-1.4 3.5 0s2.3 1.4 3.5 0" ${stroke(c, 1.5)}/>`,
  ],
  // Hex: a stone split in two, it bursts when it ends (#1367, #1440).
  shatterstone: [
    "hex",
    (c) =>
      `<path d="M3.5 10L9 5l2.5 3.5L10 12l1.5 3L5.5 19 3 14z" fill="${c}"/>` +
      `<path d="M14.5 7l6 3.5-1 4.5-5 .5V12l-1-2.5z" fill="${c}"/>`,
  ],
  // Hex: a snowflake in a head with shoulders, 90% slower (#1367, #1440).
  "mind-freeze": [
    "hex",
    (c) =>
      `<circle cx="12" cy="9" r="6" ${stroke(c, 1.8)}/>` +
      `<path d="M12 5.8v6.4M9.2 7.4l5.6 3.2M9.2 10.6l5.6-3.2" ${stroke(c, 1.4)}/>` +
      `<path d="M4.5 21c0-3.5 3-5 7.5-5s7.5 1.5 7.5 5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a ringed flame, fire sets the marked foe alight.
  "mark-of-rodgort": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="8.5" ${stroke(c, 1.6)}/>` +
      `<path d="M13 6.5c.4 2.2 2.5 3.5 2.5 6.2a3.5 3.5 0 0 1-7 0c0-1.5.6-2.7 1.5-3.3 0 1.2.3 1.8.9 2.1-.3-1.8.6-3.6 2.1-5z" fill="${c}"/>`,
  ],
  // Skill effect: a shield with a spark on a ground line, elemental damage
  // turned aside inside a ward.
  "ward-against-elements": [
    "skill-effect",
    (c) =>
      `<path d="M8 5.5h8v4.5c0 2.5-2 4.2-4 5.5-2-1.3-4-3-4-5.5z" ${stroke(c, 2)}/>` +
      `<path d="M12.8 7.5l-2 3h2.4l-2 3" ${stroke(c, 1.4)}/>` +
      `<path d="M5 18.5h14" ${stroke(c, 2.2)}/>`,
  ],
  // Elementalist staples 2 (#1575, #1605).
  // Enchantment: the skill's faceted crystal.
  "obsidian-flesh": [
    "enchantment",
    (c) =>
      `<path d="M12 3l6 4v7l-6 7-6-7V7z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 3v18M6 7l6 4 6-4" ${stroke(c, 1.2)}/>`,
  ],
  // Skill effect: the ward's ring and pole, a dragging trail of bars.
  "ward-against-foes": [
    "skill-effect",
    (c) =>
      `<ellipse cx="12" cy="18" rx="8" ry="3" ${stroke(c, 2)}/>` +
      `<path d="M12 18v-4" ${stroke(c, 2)}/>` +
      `<path d="M12 5h8M8 8.5h12M4 12h16" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: the ward's ring and pole, a planted block on top.
  "ward-of-stability": [
    "skill-effect",
    (c) =>
      `<ellipse cx="12" cy="18" rx="8" ry="3" ${stroke(c, 2)}/>` +
      `<path d="M12 18v-7" ${stroke(c, 2)}/>` +
      `<path d="M6 4h12v6H6z" fill="${c}"/>`,
  ],
  // Elementalist energy engine (#1614, #1646). Attunements: the element over a ground bar, a bolt beside it.
  "fire-attunement": [
    "enchantment",
    (c) =>
      `<path d="M10 3c2.5 3 3.5 5.5 2.2 8.2-1 1.8-3.8 1.8-4.6 0C6.3 8.5 8 6 10 3z" ${stroke(c, 1.8)}/>` +
      `<path d="M16 5l-2.5 3.5h2.5l-1.5 3" ${stroke(c, 1.6)}/>` +
      `<path d="M5 20h14" ${stroke(c, 2)}/>`,
  ],
  "water-attunement": [
    "enchantment",
    (c) =>
      `<path d="M10 3v10M5.7 5.5l8.6 5M5.7 10.5l8.6-5" ${stroke(c, 1.8)}/>` +
      `<path d="M18.5 5l-2.5 3.5h2.5l-1.5 3" ${stroke(c, 1.6)}/>` +
      `<path d="M5 20h14" ${stroke(c, 2)}/>`,
  ],
  "air-attunement": [
    "enchantment",
    (c) =>
      `<path d="M11 3l-3.6 6.5h3.6L9 15" ${stroke(c, 1.8)}/>` +
      `<path d="M16 5l-2.5 3.5h2.5l-1.5 3" ${stroke(c, 1.6)}/>` +
      `<path d="M5 20h14" ${stroke(c, 2)}/>`,
  ],
  "earth-attunement": [
    "enchantment",
    (c) =>
      `<path d="M4.5 15l3-8h5l3 8z" ${stroke(c, 1.8)}/>` +
      `<path d="M17 5l-2.5 3.5h2.5l-1.5 3" ${stroke(c, 1.6)}/>` +
      `<path d="M5 20h14" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a ring with a plus, a spark above it.
  "aura-of-restoration": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="13" r="7" ${stroke(c, 1.8)}/>` +
      `<path d="M12 9.5v7M8.5 13h7" ${stroke(c, 2.2)}/>` +
      `<path d="M13 1.5l-2 3h2l-1 2.5" ${stroke(c, 1.5)}/>`,
  ],
  // Enchantment: a shield with a circling arrow, renewed by each spell.
  "kinetic-armor": [
    "enchantment",
    (c) =>
      `<path d="M7 4h10v6c0 4-2.5 6-5 8-2.5-2-5-4-5-8z" ${stroke(c, 1.8)}/>` +
      `<path d="M9.5 10.5a2.5 2.5 0 1 1 2.5 2.5" ${stroke(c, 1.6)}/>`,
  ],
  // Elementalist staples 3 (#1710): the skills' shapes.
  // Enchantment: three wind lines trailing a forward arrow, moving faster.
  "windborne-speed": [
    "enchantment",
    (c) =>
      `<path d="M2.5 8H12A2.8 2.8 0 1 0 9.2 5.2M2.5 14.5H14M2.5 20H10" ${stroke(c, 2)}/>` +
      `<path d="M15 6.5L19 12L15 17.5M19 6.5L23 12L19 17.5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: the hex ring round an ash cloud over a crossed eye, attacks miss.
  "ash-blast": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="9.5" ${stroke(c, 1.8)} stroke-dasharray="4 3"/>` +
      `<path d="M6.5 14.5a3 3 0 0 1 .5-6 4 4 0 0 1 7.5-.5 3 3 0 0 1 .8 6.5ZM6 19L18 5" ${stroke(c, 1.8)}/>`,
  ],
  // Attribute hexes (#1765).
  // Hex: the hex ring round two wind lines held back by a bar, moving slower.
  "freezing-gust": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="9.5" ${stroke(c, 1.8)} stroke-dasharray="4 3"/>` +
      `<path d="M6 9.5h7M6 14.5h9M17 7v10" ${stroke(c, 2)}/>`,
  ],
  // Glyph: a bolt of energy struck through, cheaper and no Overcast.
  "glyph-of-energy": [
    "glyph",
    (c) =>
      `<path d="M13 3l-6 10h5l-1 8 6-10h-5z" ${stroke(c, 2)}/>` +
      `<path d="M4 20L20 4" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: three wavy lines of mist, the body turned to water.
  "mist-form": [
    "enchantment",
    (c) => `<path d="M4 8q4-3 8 0t8 0M4 13q4-3 8 0t8 0M4 18q4-3 8 0t8 0" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
