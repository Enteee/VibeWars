import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: plus, health coming back.
  regeneration: ["enchantment", (c) => `<path d="M12 6v12M6 12h12" ${stroke(c, 3)}/>`],
  // Stance: a leaf, the wild's stride: faster, blocks (#919).
  "natural-stride": [
    "stance",
    (c) =>
      `<path d="M7 19c0-6 4-10.5 10-10.5 0 6-4 10.5-10 10.5z" ${stroke(c, 1.8)}/>` +
      `<path d="M7 19l6.5-6.5" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: a bolt, blocks and attacks faster (#976).
  "lightning-reflexes": [
    "stance",
    (c) => `<path d="M13.5 5L8 13h4l-1.5 6L16 11h-4z" ${stroke(c, 2)}/>`,
  ],
  // Stance: two chevrons and a bar, away and blocking (#976).
  escape: [
    "stance",
    (c) =>
      `<path d="M6 8.5l4 3.5-4 3.5M11 8.5l4 3.5-4 3.5" ${stroke(c, 2.2)}/>` +
      `<path d="M18 7.5v9" ${stroke(c, 2.2)}/>`,
  ],
  // Stance: a wavy serpent, skills recharge faster.
  "serpents-quickness": [
    "stance",
    (c) => `<path d="M5 16c3 0 3-8 6-8s3 8 6 8M17 16l2-2" ${stroke(c, 2.2)}/>`,
  ],
  // Stance: a step aside an arrow, faster and blocks projectiles.
  dodge: ["stance", (c) => `<path d="M4 8h10M11 5l3 3-3 3M8 18l4-5 4 5" ${stroke(c, 2.2)}/>`],
  // Stance: speed chevrons with an arrow's dashed trace passing behind (#1697).
  "zojuns-haste": [
    "stance",
    (c) =>
      `<path d="M4 20L20 4" ${stroke(c, 1.4)} stroke-dasharray="2.4 2.4"/>` +
      `<path d="M7 7l5 5-5 5M13 7l5 5-5 5" ${stroke(c, 2.4)}/>`,
  ],
  // Preparation: one drop, your attacks poison (#525).
  "apply-poison": [
    "preparation",
    (c) => `<path d="M12 8.5c-2 3-3 4.6-3 6.2a3 3 0 0 0 6 0c0-1.6-1-3.2-3-6.2z" fill="${c}"/>`,
  ],
  // Skill effect: a blade and a plus, hits land harder near Winnowing (#1064).
  winnowing: [
    "skill-effect",
    (c) =>
      `<path d="M5 17L13 9" ${stroke(c, 2.2)}/>` + `<path d="M17 6v6M14 9h6" ${stroke(c, 2)}/>`,
  ],
  // Shout: two chevrons right, the pet bites and runs faster (#1108).
  "call-of-haste": [
    "shout",
    (c) => `<path d="M7 7.5l4.5 4.5L7 16.5M12.5 7.5l4.5 4.5-4.5 4.5" ${stroke(c, 2.2)}/>`,
  ],
  // Shout: a shield with a minus, less damage to the pet (#1108).
  "call-of-protection": [
    "shout",
    (c) =>
      `<path d="M7 5.5h10v5.5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" ${stroke(c, 2)}/>` +
      `<path d="M9.5 11h5" ${stroke(c, 2.2)}/>`,
  ],
  // Shout: two linked rings, half the pet's hurt shared with you (#1108).
  "symbiotic-bond": [
    "shout",
    (c) =>
      `<circle cx="9.5" cy="12" r="3.5" ${stroke(c, 2)}/><circle cx="14.5" cy="12" r="3.5" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: two rising flames, adrenaline comes faster near the spirit.
  "infuriating-heat": [
    "skill-effect",
    (c) =>
      `<path d="M8 6c.4 2.5 3 4 3 7a3 3 0 0 1-6 0c0-1.6.7-2.8 1.6-3.4 0 1.2.3 1.8.9 2.1C7.2 9.8 6.8 7.6 8 6zM16 6c.4 2.5 3 4 3 7a3 3 0 0 1-6 0c0-1.6.7-2.8 1.6-3.4 0 1.2.3 1.8.9 2.1-.3-1.9-.7-4.1.5-5.7z" fill="${c}"/>` +
      `<path d="M6 19.5h12" ${stroke(c, 1.8)}/>`,
  ],
  // Preparation: an arrow with a flame at its head, your arrows burn.
  "kindle-arrows": [
    "preparation",
    (c) =>
      `<path d="M3.5 15L13 5.5" ${stroke(c, 2)}/>` +
      `<path d="M19 2.5L9.5 5.5L16 12Z" fill="${c}"/>` +
      `<path d="M16 11c.6 3 3.5 4 3.5 7a3.5 3.5 0 0 1-7 0c0-1.5.6-2.6 1.5-3.2 0 1.2.4 1.8 1 2.1-.3-1.8.5-3.7 1-5.9z" fill="${c}"/>`,
  ],
  // Preparation: an arrow with a burst beside it, as the skill's icon (Ignite Arrows).
  "ignite-arrows": [
    "preparation",
    (c) =>
      `<path d="M3.5 15L13 5.5" ${stroke(c, 2)}/>` +
      `<path d="M19 2.5L9.5 5.5L16 12Z" fill="${c}"/>` +
      `<path d="M16 11.5V20M12 15.8H20.5M13.2 13L18.8 18.6M18.8 13L13.2 18.6" ${stroke(c, 1.8)}/>`,
  ],
  // Ranger staples 4 (#1742, #1768): the preparation icons repeat their skill's glyph.
  // Preparation: an arrow and a ring it passes through, no block stops it.
  "seeking-arrows": [
    "preparation",
    (c) =>
      `<path d="M10 11L15 13V16C15 18.4 13 19.8 10 21C7 19.8 5 18.4 5 16V13Z" ${stroke(c, 1.8)}/>` +
      `<path d="M2 11C3 5.5 9 2.5 17.5 4.4" ${stroke(c, 2.2)}/>` +
      `<path d="M22.5 6L16.3 7.5L18.1 1.4Z" fill="${c}"/>`,
  ],
  // Preparation: an arrow with barbs and a drop, your arrows bleed.
  "barbed-arrows": [
    "preparation",
    (c) =>
      `<path d="M3 21L14.5 9.5M7 17L3.5 16.5M10 14L6.5 13.5M7 17L7.5 20.5M10 14L10.5 17.5" ${stroke(c, 2)}/>` +
      `<path d="M21.5 2.5L11.5 5.5L18.5 12.5Z" fill="${c}"/>` +
      `<path d="M19 14c1.6 2 2.6 3.2 2.6 4.4a2.6 2.6 0 0 1-5.2 0c0-1.2 1-2.4 2.6-4.4z" fill="${c}"/>`,
  ],
  // Skill effect: a struck-through shield, -40 armor while it is activated.
  "barbed-arrows-armor": [
    "skill-effect",
    (c) =>
      `<path d="M8.5 6.5h7v4c0 2.2-1.8 3.7-3.5 4.8-1.7-1.1-3.5-2.6-3.5-4.8z" ${stroke(c, 1.8)}/>` +
      `<path d="M6.5 17.5l11-11" ${stroke(c, 2)}/><path d="M5 19.5h4" ${stroke(c, 1.6)}/>`,
  ],
  // Preparation: an arrow with a leaf beside it, bleeding and more on the enchanted.
  "melandrus-arrows": [
    "preparation",
    (c) =>
      `<path d="M5.5 18.5L14 10" ${stroke(c, 2.2)}/>` +
      `<path d="M2 11C2 6 5 3 10 3C10 8 7 11 2 11Z" ${stroke(c, 1.8)}/>` +
      `<path d="M21.5 2.5L11.5 5.5L18.5 12.5Z" fill="${c}"/>` +
      `<path d="M19 14c1.6 2 2.6 3.2 2.6 4.4a2.6 2.6 0 0 1-5.2 0c0-1.2 1-2.4 2.6-4.4z" fill="${c}"/>`,
  ],
  // Preparation: an arrow and two wind lines, your arrows fly twice as fast.
  "read-the-wind": [
    "preparation",
    (c) =>
      `<path d="M10 14L17 7" ${stroke(c, 2.2)}/>` +
      `<path d="M22 2.5L13.5 4.5L19.5 10.5Z" fill="${c}"/>` +
      `<path d="M2 10H8.5a2.5 2.5 0 1 0-2.5-2.5M2 14H7M2 18.5H9.5a2.2 2.2 0 1 1-2.2 2.2" ${stroke(c, 1.8)}/>`,
  ],
  // Nature rituals 1 (#1745): what each spirit does to whoever is near it.
  // Skill effect: a heart with a plus, more health near the spirit.
  "fertile-season": [
    "skill-effect",
    (c) =>
      `<path d="M12 19s-6.5-4-6.5-8.5A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 6.5 2c0 4.5-6.5 8.5-6.5 8.5z" ${stroke(c, 2)}/>` +
      `<path d="M12 10.5v5M9.5 13h5" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: a circular arrow, skills come back faster.
  "quickening-zephyr": [
    "skill-effect",
    (c) => `<path d="M18 12a6 6 0 1 1-2-4.5M18 5v3h-3" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: a snowflake over the ground, no one rises here.
  "frozen-soil": [
    "skill-effect",
    (c) =>
      `<path d="M12 4v10M7.7 6.5l8.6 5M16.3 6.5l-8.6 5" ${stroke(c, 1.8)}/>` +
      `<path d="M5 18.5h14" ${stroke(c, 2.2)}/>`,
  ],
  // Skill effect: a foot over wavy mud, slower and no running.
  "muddy-terrain": [
    "skill-effect",
    (c) =>
      `<path d="M10 5c2 0 3 2 3 4.5S12 14 10 14s-3-2-3-4.5S8 5 10 5z" fill="${c}"/>` +
      `<path d="M4 18c2-1.5 4-1.5 6 0s4 1.5 6 0 3-1 4-.5" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: an arrow in a flame, arrows burn near the spirit.
  conflagration: [
    "skill-effect",
    (c) =>
      `<path d="M12 4c.6 3 4.5 4.8 4.5 9a4.5 4.5 0 0 1-9 0c0-2 .9-3.6 2.2-4.4 0 1.6.5 2.4 1.3 2.8-.4-2.5-.4-5.1 1-7.4z" ${stroke(c, 1.8)}/>` +
      `<path d="M5 19L12 12" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: fangs over a minus, heals weaker, hits feed you.
  "predatory-season": [
    "skill-effect",
    (c) =>
      `<path d="M6 6h12M8 6l1.5 6L11 6M13 6l1.5 6L16 6" ${stroke(c, 1.8)}/>` +
      `<path d="M8.5 17.5h7" ${stroke(c, 2.2)}/>`,
  ],
  // Skill effect: a snowflake, elemental damage turns cold.
  winter: [
    "skill-effect",
    (c) =>
      `<path d="M12 4v16M5 8l14 8M19 8L5 16" ${stroke(c, 1.8)}/>` +
      `<path d="M10 5.5l2 2 2-2M10 18.5l2-2 2 2" ${stroke(c, 1.6)}/>`,
  ],
  // Nature rituals 2 (#1873).
  // Skill effect: a heart over a sparkle, more health per enchantment.
  symbiosis: [
    "skill-effect",
    (c) =>
      `<path d="M12 17s-5-3-5-6.5A2.7 2.7 0 0 1 12 9a2.7 2.7 0 0 1 5 1.5c0 3.5-5 6.5-5 6.5z" ${stroke(c, 2)}/>` +
      `<path d="M12 3v3M10.5 4.5h3" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: an arrow on wind lines, arrows fly faster and harder.
  "favorable-winds": [
    "skill-effect",
    (c) =>
      `<path d="M5 19L19 5M19 5h-5M19 5v5" ${stroke(c, 2)}/>` +
      `<path d="M4 12h5M7 16h4" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a thorned stem, the knocked down bleed.
  brambles: [
    "skill-effect",
    (c) =>
      `<path d="M6 19c3-3 4-8 12-14" ${stroke(c, 2)}/>` +
      `<path d="M9 14l-3-1M11 11l1-3M14 8l3 1" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a still wave, enchantments end sooner.
  tranquility: [
    "skill-effect",
    (c) =>
      `<path d="M4 10c2.5-2 5.5-2 8 0s5.5 2 8 0" ${stroke(c, 2)}/>` +
      `<path d="M4 15h16" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: a drop over a minus, the poisoned and diseased degenerate.
  toxicity: [
    "skill-effect",
    (c) =>
      `<path d="M12 4c2 3 4.5 5.5 4.5 8.5a4.5 4.5 0 0 1-9 0C7.5 9.5 10 7 12 4z" ${stroke(c, 1.8)}/>` +
      `<path d="M9.5 19.5h5" ${stroke(c, 2.2)}/>`,
  ],
  // Skill effect: a sword in a flame, physical damage burns.
  "greater-conflagration": [
    "skill-effect",
    (c) =>
      `<path d="M12 4c.6 3 4.5 4.8 4.5 9a4.5 4.5 0 0 1-9 0c0-2 .9-3.6 2.2-4.4 0 1.6.5 2.4 1.3 2.8-.4-2.5-.4-5.1 1-7.4z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 21V11M9.5 14h5" ${stroke(c, 2)}/>`,
  ],
  // Nature rituals 3 (#1886, #1921). Skill effect: three straight wind
  // streaks over a bold minus, skills cost less. No curl: Roaring Winds has
  // those; Primal Echoes is round.
  "energizing-wind": [
    "skill-effect",
    (c) =>
      `<path d="M3 7h13M3 11h18M3 15h9" ${stroke(c, 1.8)}/>` +
      `<path d="M14 17.5h6" ${stroke(c, 2.8)}/>`,
  ],
  // Skill effect: a seal and the ring that echoes it, signets cost Energy.
  "primal-echoes": [
    "skill-effect",
    (c) =>
      `<circle cx="12" cy="12" r="8.5" ${stroke(c, 1.6)}/>` +
      `<circle cx="12" cy="12" r="4.5" fill="${c}"/>`,
  ],
  // Skill effect: a wind curl with a plus, shouts and chants cost more.
  "roaring-winds": [
    "skill-effect",
    (c) =>
      `<path d="M4 10h10a3 3 0 1 0-3-3M4 15h13a3 3 0 1 1-3 3" ${stroke(c, 1.8)}/>` +
      `<path d="M18 5v5M15.5 7.5h5" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: an empty bar struck, damage at 0 Energy.
  famine: [
    "skill-effect",
    (c) =>
      `<rect x="4" y="9" width="16" height="6" rx="1.5" ${stroke(c, 1.8)}/>` +
      `<path d="M13 4l-3 8h4l-3 8" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: a drop with a minus, Bleeding worsened.
  lacerate: [
    "skill-effect",
    (c) =>
      `<path d="M10 4c-3 5-5 8-5 10.5a5 5 0 0 0 10 0C15 12 13 9 10 4z" ${stroke(c, 1.8)}/>` +
      `<path d="M16 7h5" ${stroke(c, 2)}/>`,
  ],
  // Stance (#1761, #1855): a bow and a recharge arrow, preparations come back sooner.
  "practiced-stance": [
    "stance",
    (c) =>
      `<g transform="translate(5,5) scale(0.58)">` +
      `<path d="M7 2.5C0 8 0 16 7 21.5" ${stroke(c, 3)}/>` +
      `<path d="M7 2.5V21.5" ${stroke(c, 1.6)}/>` +
      `<path d="M20 9a5.2 5.2 0 1 0 1.2 4.4" ${stroke(c, 2.6)}/>` +
      `<path d="M17.5 6.5L20.5 9.3L17 11" ${stroke(c, 2.4)}/>` +
      `</g>`,
  ],
  // Shout: a plus beside a fang, the pet's bites heal you.
  "predatory-bond": [
    "shout",
    (c) =>
      `<path d="M8 7v8M4 11h8" ${stroke(c, 2.4)}/>` +
      `<path d="M15 6l4 0-2 12z" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: three chevrons, attacking and running faster together.
  "rampage-as-one": [
    "skill-effect",
    (c) =>
      `<path d="M4.5 7.5L9 12l-4.5 4.5M10 7.5l4.5 4.5L10 16.5M15.5 7.5L20 12l-4.5 4.5" ${stroke(c, 2)}/>`,
  ],
  // Stance: two chevrons, running faster together.
  "run-as-one": [
    "stance",
    (c) => `<path d="M7 7.5l4.5 4.5L7 16.5M12.5 7.5l4.5 4.5-4.5 4.5" ${stroke(c, 2.2)}/>`,
  ],
  // Skill effect: a drop under a paw, the pet's next attack Bleeds.
  "strike-as-one-pet": [
    "skill-effect",
    (c) =>
      `<circle cx="12" cy="8" r="3.5" fill="${c}"/>` +
      `<path d="M12 13c-2.5 3.5-3.5 5-3.5 6.5a3.5 3.5 0 0 0 7 0c0-1.5-1-3-3.5-6.5z" ${stroke(c, 1.8)}/>`,
  ],
  // Preparation: jaws with a bar across, traps held steady.
  "trappers-focus": [
    "preparation",
    (c) =>
      `<path d="M4 9l4 4 4-4 4 4 4-4" ${stroke(c, 1.8)}/>` +
      `<path d="M4 17h16" ${stroke(c, 2.2)}/>`,
  ],
  // Stance: jaws with a speed line, traps set sooner.
  "trappers-speed": [
    "stance",
    (c) =>
      `<path d="M4 13l4 4 4-4 4 4 4-4" ${stroke(c, 1.8)}/>` +
      `<path d="M6 7h12M14 4l4 3-4 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
