import { C, perEach, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: a plus in a ring, health for every enchantment around it (#845).
  "mystic-regeneration": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="7.5" ${stroke(c, 1.8)}/>` +
      `<path d="M12 8.5v7M8.5 12h7" ${stroke(c, 2.5)}/>`,
  ],
  // Enchantment: a post on firm ground, you cannot be knocked down (#845).
  "fleeting-stability": [
    "enchantment",
    (c) => `<path d="M12 5v11M6.5 18.5h11" ${stroke(c, 2.8)}/>`,
  ],
  // Stance: a heart, filled, you attack faster (#845).
  "heart-of-fury": [
    "stance",
    (c) => `<path d="M12 18l-4.8-4.8a2.8 2.8 0 0 1 4.8-4 2.8 2.8 0 0 1 4.8 4z" fill="${c}"/>`,
  ],
  // Enchantment: a blade with a ring round it, slashing all adjacent foes
  // whenever you attack (#939).
  "vow-of-strength": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="7.5" ${stroke(c, 1.6)}/>` +
      `<path d="M8.5 15.5l7-7M9 12.5l2.5 2.5" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: three grains of sand, flung at the foes beside your hit (#939).
  "sand-shards": [
    "enchantment",
    (c) =>
      `<path d="M12 5.5l2 3.5h-4z" fill="${c}"/>` +
      `<path d="M7.5 13l2 3.5h-4z" fill="${c}"/>` +
      `<path d="M16.5 13l2 3.5h-4z" fill="${c}"/>`,
  ],
  // Stance: one chevron, forward: move 25% faster (#939).
  "pious-haste": ["stance", (c) => `<path d="M9.5 9l4.5 5-4.5 5" ${stroke(c, 2.5)}/>`],
  // Stance: three chevrons, forward: run 50% faster, an enchantment paid (#939).
  "pious-haste-run": [
    "stance",
    (c) => `<path d="M5 9l4 5-4 5M9.5 9l4 5-4 5M14 9l4 5-4 5" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a peak split down the middle, your attacks are earth and
  // crack the armor round you when it ends (#1021).
  "staggering-force": [
    "enchantment",
    (c) =>
      `<path d="M5 18l7-11 7 11z" fill="${c}"/>` +
      `<path d="M12 9l-1.5 4 2 2-1 3" ${stroke(C.enchantment, 1.6)}/>`,
  ],
  // Enchantment: a cloud of grains, your attacks are earth and blind the
  // foes round you when it ends (#1021).
  "dust-cloak": [
    "enchantment",
    (c) =>
      `<circle cx="9" cy="10" r="1.6" fill="${c}"/><circle cx="14" cy="8.5" r="1.6" fill="${c}"/>` +
      `<circle cx="12" cy="13" r="1.6" fill="${c}"/><circle cx="7.5" cy="15" r="1.6" fill="${c}"/>` +
      `<circle cx="16.5" cy="14" r="1.6" fill="${c}"/><circle cx="12" cy="17.5" r="1.6" fill="${c}"/>`,
  ],
  // Enchantment: a ring of thorns, bleeding as it lands and crippling when
  // it ends (#1021).
  "aura-of-thorns": [
    "enchantment",
    (c) =>
      `<path d="M4.5 19.5C8 17 14 12 19.5 5" ${stroke(c, 2)}/>` +
      `<path d="M7.5 16L6 11.5M11 13.5L9.5 9M15 10L14.5 5.5M9 17.5L11.5 20M13 14.5L16 17" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: two speed chevrons and a drop, faster until it ends, and a condition goes (#1421).
  "enchanted-haste": [
    "enchantment",
    (c) =>
      `<path d="M4 7l4.5 5L4 17M9.5 7l4.5 5-4.5 5" ${stroke(c, 2)}/>` +
      `<path d="M18.5 8c1.5 2.2 2.5 3.4 2.5 4.8a2.5 2.5 0 0 1-5 0c0-1.4 1-2.6 2.5-4.8z" ${stroke(c, 1.6)}/>` +
      `<path d="M15 6.5l7 13" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a flame under a halo, holy attacks, burning when it ends (#1421).
  "heart-of-holy-flame": [
    "enchantment",
    (c) =>
      `<ellipse cx="12" cy="5.5" rx="5" ry="1.8" ${stroke(c, 1.6)}/>` +
      `<path d="M12 9c2.2 2.2 2.8 4 2.8 5.6a2.8 2.8 0 0 1-5.6 0c0-1.3.7-2.2 1.4-2.9.2 1 .8 1.5 1.4 1.9 0-1.7 0-3 0-4.6z" fill="${c}"/>`,
  ],
  // Enchantment: a flame beside rising bars, adrenaline when it ends (#1421).
  "balthazars-rage": [
    "enchantment",
    (c) =>
      `<path d="M8.5 5c2.5 2.5 3 4.5 3 6.5a3 3 0 0 1-6 0c0-1.7.8-2.7 1.7-3.6.2 1.2.8 1.7 1.3 2.1 0-1.8 0-3.2 0-5z" fill="${c}"/>` +
      `<path d="M15 18v-3M18 18v-6M21 18V9M4 19.5h18" ${stroke(c, 1.8)}/>`,
  ],
  // Form: a leaf, Melandru's earth (#1437).
  "avatar-of-melandru": [
    "form",
    (c) =>
      `<circle cx="12" cy="13" r="2.5" fill="${c}"/>` +
      `<path d="M6 20c0-3.5 2.5-5 6-5s6 1.5 6 5" ${stroke(c, 2.2)}/>` +
      `<path d="M12 10.5V8" ${stroke(c, 1.6)}/>` +
      `<path d="M12 8.5C12 6 10 4.5 6.5 5c0 2.5 1.5 3.7 5.5 3.5zM12 8.5C12 6 14 4.5 17.5 5c0 2.5-1.5 3.7-5.5 3.5z" fill="${c}"/>`,
  ],
  // Form: wings spread, Dwayna's (#1437).
  "avatar-of-dwayna": [
    "form",
    (c) =>
      `<path d="M10 14C8 9.5 5.5 8 3 8c0 4.5 2 7 7 7zM14 14c2-4.5 4.5-6 7-6 0 4.5-2 7-7 7z" fill="${c}"/>` +
      `<circle cx="12" cy="10" r="2.3" fill="${c}"/>` +
      `<path d="M7.5 21c0-3.5 2-5.5 4.5-5.5s4.5 2 4.5 5.5" ${stroke(c, 2)}/>`,
  ],
  // Form: a flame over a head, Balthazar's fire (#1471).
  "avatar-of-balthazar": [
    "form",
    (c) =>
      `<path d="M12 3c2.5 2.5 3.2 4.2 3.2 6a3.2 3.2 0 0 1-6.4 0c0-1.5.8-2.7 1.8-3.5.2 1.2.7 1.7 1.4 2 0-1.8-.1-3 0-4.5z" fill="${c}"/>` +
      `<circle cx="12" cy="13.5" r="2.2" fill="${c}"/>` +
      `<path d="M7 21c0-3 2-4.5 5-4.5s5 1.5 5 4.5" ${stroke(c, 2)}/>`,
  ],
  // Form: a scythe behind a figure, Grenth's death (#1471).
  "avatar-of-grenth": [
    "form",
    (c) =>
      `<path d="M16 21L11 6" ${stroke(c, 1.8)}/>` +
      `<path d="M11 6C8.5 4.5 5.5 5 4 7.5c2.5-.5 4.5.2 6.5 2.5z" fill="${c}"/>` +
      `<circle cx="9.5" cy="12" r="2.2" fill="${c}"/>` +
      `<path d="M5 21c0-3 1.8-4.5 4.5-4.5S14 18 14 21" ${stroke(c, 2)}/>`,
  ],
  // Form: a figure between two zigzags, Lyssa's chaos (#1471).
  "avatar-of-lyssa": [
    "form",
    (c) =>
      `<path d="M6.5 5L4.5 9L7.5 11.5L5 16L7 19M17.5 5L19.5 9L16.5 11.5L19 16L17 19" ${stroke(c, 1.6)}/>` +
      `<circle cx="12" cy="10" r="2.2" fill="${c}"/>` +
      `<path d="M8.5 21c0-3 1.5-5 3.5-5s3.5 2 3.5 5" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a chevron chasing a dot with a spark, faster and harder on runners (#1421).
  "harriers-haste": [
    "enchantment",
    (c) =>
      `<path d="M5 7l5 5-5 5" ${stroke(c, 2.2)}/>` +
      `<circle cx="15" cy="12" r="2.2" fill="${c}"/>` +
      `<path d="M19 8l2-2M19 16l2 2M20 12h2" ${stroke(c, 1.6)}/>`,
  ],
  // Dervish staples and Shadow Prison (#1551, #1573): each matches its skill icon.
  // Enchantment: a hand over a broken line, attack skills cripple.
  "grenths-grasp": [
    "enchantment",
    (c) =>
      `<path d="M7 3.5V9M10 3V9M14 3V9M17 3.5V9" ${stroke(c, 1.8)}/>` +
      `<path d="M5.5 8.5H18.5V10.5A6.5 6.5 0 0 1 5.5 10.5Z" fill="${c}"/>` +
      `<path d="M4.5 20L8.5 17.5L12 19.5L15.5 17L19.5 19" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a ring broken open round a burst, cold that strips an enchantment.
  "rending-aura": [
    "enchantment",
    (c) =>
      `<path d="M12 3.5A8.5 8.5 0 0 1 20.5 12M18 18A8.5 8.5 0 0 1 8 20M5 17A8.5 8.5 0 0 1 5 7" ${stroke(c, 1.6)}/>` +
      `<path d="M12 7V17M7.7 9.5L16.3 14.5M7.7 14.5L16.3 9.5" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a spark over a falling bar, energy for every hit.
  "zealous-renewal": [
    "enchantment",
    (c) =>
      `<path d="M12 3l2 5h-4l2 5" ${stroke(c, 1.8)}/>` +
      `<path d="M6 17h12M9 21h6" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a shield seen through a heat haze, it blocks.
  "mirage-cloak": [
    "enchantment",
    (c) =>
      `<path d="M12 4l6 2v5c0 4-3 7-6 9-3-2-6-5-6-9V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M9 10q1.5-1.5 3 0t3 0M9 14q1.5-1.5 3 0t3 0" ${stroke(c, 1.4)}/>`,
  ],
  // Enchantment: a heart with a plus, more health and a heal when it ends.
  "vital-boon": [
    "enchantment",
    (c) =>
      `<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 9v6M9 12h6" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: an open hand over an arrow, the next attacks cannot be blocked.
  "guiding-hands": [
    "enchantment",
    (c) =>
      `<path d="M7 12V6M10 12V4M13 12V4M16 12V6M7 12c0 4 2 6 5 6s4-2 4-6" ${stroke(c, 1.6)}/>` +
      `<path d="M4 21h16M17 18l3 3-3 3" ${stroke(c, 1.6)}/>`,
  ],
  // Dervish staples 3 (#1707): the skills' shapes.
  // Enchantment: two fast slashes over a rising bar, attack and adrenaline faster.
  onslaught: [
    "enchantment",
    (c) =>
      `<path d="M10 21L21 4" ${stroke(c, 3.2)}/>` +
      `<path d="M15 21L23 9" ${stroke(c, 1.6)}/>` +
      `<path d="M2 7H9M2 12H7M2 17H5" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a spark over two falling bars and a minus, energy per hit, less regeneration.
  "zealous-vow": [
    "enchantment",
    (c) =>
      `<path d="M12 2.5L14.5 8H9.5L12 13.5" ${stroke(c, 2)}/>` +
      `<path d="M5 17H19M8 21H16M18.5 5H22.5" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a feather with speed chevrons, it moves faster and sheds conditions sooner.
  "featherfoot-grace": [
    "enchantment",
    (c) =>
      `<path d="M19 3C11 4 7 10 7 19M19 3c0 7-5 11-11 12" ${stroke(c, 2)}/>` +
      `<path d="M3 9L6 12L3 15M3 17L6 20L3 23" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a spiral of wind ending in an arrowhead, it runs and its next hit chills the crowd.
  "whirling-charge": [
    "enchantment",
    (c) =>
      `<path d="M12 12a2 2 0 1 1 2-2a4 4 0 1 1-4-4a6 6 0 1 1-6 6" ${stroke(c, 2)}/>` +
      `<path d="M1.5 14L4 18L8 15.5" ${stroke(c, 2)}/>`,
  ],
  // Ally threshold mechanics (#1789, #1817): a Health bar and the line that answers.
  // Enchantment: an eye over a line a quarter up, it heals at the drop.
  "watchful-intervention": [
    "enchantment",
    (c) =>
      `<path d="M3.5 9C7 4.5 17 4.5 20.5 9C17 13.5 7 13.5 3.5 9z" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="9" r="2" fill="${c}"/>` +
      `<rect x="3" y="18.5" width="18" height="3.5" rx="0.8" ${stroke(c, 1.8)}/>` +
      `<rect x="3" y="18.5" width="4.5" height="3.5" rx="0.8" fill="${c}"/>`,
  ],
  // Enchantment: a heart above a line at half, it ends there and heals.
  "faithful-intervention": [
    "enchantment",
    (c) =>
      `<path d="M12 16s-5.5-3.4-5.5-7a3 3 0 0 1 5.5-1.7A3 3 0 0 1 17.5 9c0 3.6-5.5 7-5.5 7z" transform="translate(-3,0)" ${stroke(c, 1.8)}/>` +
      `<circle cx="19.5" cy="5.5" r="3.2" ${stroke(c, 1.5)}/><circle cx="19.5" cy="5.5" r="1.1" fill="${c}"/>` +
      `<rect x="3" y="18.5" width="18" height="3.5" rx="0.8" ${stroke(c, 1.8)}/>` +
      `<rect x="3" y="18.5" width="9" height="3.5" rx="0.8" fill="${c}"/>`,
  ],
  // Skill effect (#1761, #1855): a scythe over a long drawn-out arrow, the
  // next Dervish enchantment lasts longer.
  "extend-enchantments": [
    "skill-effect",
    (c) =>
      `<g transform="translate(5,5) scale(0.58)">` +
      `<path d="M6 17L9.5 2.5" ${stroke(c, 2.8)}/>` +
      `<path d="M9.5 2.5C17 1.5 22.5 5.5 22.5 11C18.5 8 14.5 7.5 9 9Z" fill="${c}"/>` +
      `<path d="M5 21.5H22.5M19.5 18.8L22.5 21.5L19.5 24.2" ${stroke(c, 2.4)}/>` +
      `</g>`,
  ],
  // "N for each X" (#1850): the skill's drawing, shrunk into the frame.
  "arcane-zeal": [
    "enchantment",
    (c) =>
      `<g transform="translate(12,12) scale(0.62) translate(-12,-12)">${perEach("zeal", c, 2.8)}</g>`,
  ],
  "mystic-vigor": [
    "enchantment",
    (c) =>
      `<g transform="translate(12,12) scale(0.62) translate(-12,-12)">${perEach("vigor", c, 2.8)}</g>`,
  ],
};

export default rows;
