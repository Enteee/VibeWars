import { perEach, stroke } from "../icon-kit.mjs";

/** @type {Readonly<Record<string, [import("../icon-kit.mjs").Category, import("../icon-kit.mjs").Glyph]>>} */
export const MESMER_STATUS_ICONS = {
  // Stance: an arrow come round, spells back sooner (#938).
  "mantra-of-recovery": [
    "stance",
    (c) =>
      `<path d="M16.5 10.5A5 5 0 1 0 17 15" ${stroke(c, 2)}/>` +
      `<path d="M14 9.5l3.5-1 .5 3.5z" fill="${c}"/>`,
  ],
  // Hex: an arrow turning back on itself, a spell that hurts its caster (#469).
  backfire: [
    "hex",
    (c) =>
      `<path d="M15.5 8.5A4.5 4.5 0 1 0 16.5 13" ${stroke(c, 2.2)}/>` +
      `<path d="M13 6.5l3.5 2-2 3.5z" fill="${c}"/>`,
  ],
  // Hex: a sword point down, an attack that hurts its attacker (#469).
  empathy: ["hex", (c) => `<path d="M12 18.5v-10M8.5 8.5h7M12 8.5v-4" ${stroke(c, 2.5)}/>`],
  // Hex: an hourglass, the next skill's recharge drawn out (#949).
  diversion: [
    "hex",
    (c) =>
      `<path d="M8 6h8M8 18h8" ${stroke(c, 2)}/>` +
      `<path d="M9 6.5c0 3 6 3.5 6 5.5s-6 2.5-6 5.5M15 6.5c0 3-6 3.5-6 5.5s6 2.5 6 5.5" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a dot and two waves, the next spell sounding again (#469).
  "arcane-echo": [
    "enchantment",
    (c) =>
      `<circle cx="8" cy="12" r="2.2" fill="${c}"/>` +
      `<path d="M12 8a5 5 0 0 1 0 8M15.5 5.5a8.5 8.5 0 0 1 0 13" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a bar and two waves, the next skill sounding again (#469).
  echo: [
    "enchantment",
    (c) =>
      `<path d="M7.5 8v8" ${stroke(c, 2.5)}/>` +
      `<path d="M12 8a5 5 0 0 1 0 8M15.5 5.5a8.5 8.5 0 0 1 0 13" ${stroke(c, 2)}/>`,
  ],
  // Hex: an hourglass about to burst, damage when it runs out (#1473).
  "wastrels-worry": [
    "hex",
    (c) =>
      `<path d="M7 4h10M7 20h10M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8s8 3 8 8" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a bolt through a bar, damage on a foe mid-skill (#1473).
  overload: ["hex", (c) => `<path d="M13 3l-6 10h5l-1 8 6-10h-5z" fill="${c}"/>`],
  // Hex: a broken circle, hurt whenever interrupted (#1473).
  frustration: [
    "hex",
    (c) =>
      `<path d="M15 5.5A7 7 0 1 0 18.5 12" ${stroke(c, 2.2)}/>` +
      `<path d="M17 4l3 3M20 4l-3 3" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a crown tipped over, an elite skill's price (#1473).
  "price-of-pride": ["hex", (c) => `<path d="M4 16l2-9 4 4 2-6 2 6 4-4 2 9z" fill="${c}"/>`],
  // Hex: a head with a jagged ache, every skill slower (#1473).
  migraine: [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="7" ${stroke(c, 1.8)}/>` +
      `<path d="M8 11l2-2 2 3 2-3 2 2" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: an eye with a tear, hurt for every skill used (#1473).
  "visions-of-regret": [
    "hex",
    (c) =>
      `<path d="M3 11c4-5 14-5 18 0-4 5-14 5-18 0z" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="11" r="2" fill="${c}"/>` +
      `<path d="M12 15.5c-1 1.5-1.5 2.3-1.5 3a1.5 1.5 0 0 0 3 0c0-.7-.5-1.5-1.5-3z" fill="${c}"/>`,
  ],
  // Hex: three degeneration arrows, a phantasm's -5 (#1228).
  "conjure-phantasm": [
    "hex",
    (c) => `<path d="M5 9l2.5 3L10 9M9.5 9l2.5 3 2.5-3M14 9l2.5 3L19 9" ${stroke(c, 2)}/>`,
  ],
  // Hex: a weight hung on a foot, moving 50% slower (#1228).
  "imagined-burden": [
    "hex",
    (c) => `<path d="M12 5v4" ${stroke(c, 2)}/>` + `<path d="M8.5 9h7l2 9h-11z" fill="${c}"/>`,
  ],
  // Hex: a jagged ache over a drop, a deep wound when it ends (#1228).
  "phantom-pain": [
    "hex",
    (c) =>
      `<path d="M5 9l3-3 3 3 3-3 3 3" ${stroke(c, 2)}/>` +
      `<path d="M12 11.5c-1.8 2.4-2.5 3.6-2.5 4.6a2.5 2.5 0 0 0 5 0c0-1-.7-2.2-2.5-4.6z" fill="${c}"/>`,
  ],
  // Hex: a shield closing in on itself, cracked armor when it ends (#1228).
  "shrinking-armor": [
    "hex",
    (c) =>
      `<path d="M8.5 7h7v4.5c0 2.4-1.8 4-3.5 5-1.7-1-3.5-2.6-3.5-5z" ${stroke(c, 2)}/>` +
      `<path d="M12 8.5l-1 3 1.5 1.5-.5 2.5" ${stroke(c, 1.4)}/>`,
  ],
  // Enchantment: a chevron and a broken one, faster now and crippled after (#1228).
  "illusion-of-haste": [
    "enchantment",
    (c) =>
      `<path d="M6 7.5l4.5 4.5L6 16.5" ${stroke(c, 2.4)}/>` +
      `<path d="M13 7.5l3 3M16 13.5l-3 3" ${stroke(c, 2)}/>`,
  ],
  // Hex: a blade crossed out, the next attack hurts and blinds (#1228).
  ineptitude: [
    "hex",
    (c) =>
      `<path d="M12 18.5v-10M8.5 8.5h7M12 8.5v-4" ${stroke(c, 2.2)}/>` +
      `<path d="M6 6l12 12" ${stroke(c, 2)}/>`,
  ],
  // Hex: a limping foot and a degeneration arrow, slowed and draining (#1228).
  "crippling-anguish": [
    "hex",
    (c) =>
      `<path d="M6 17.5h5l2-4" ${stroke(c, 2.2)}/>` +
      `<path d="M14 7l2.5 3L19 7" ${stroke(c, 2)}/>`,
  ],
  // Stance: a broken ring, the next hex fails (#1403).
  "hex-breaker": [
    "stance",
    (c) =>
      `<path d="M10 5.3A7 7 0 1 0 18.7 10M14 5.3A7 7 0 0 1 18.7 10" ${stroke(c, 2.2)}/>` +
      `<path d="M11 4l2 3-2 1 2 3" ${stroke(c, 1.6)}/>`,
  ],
  // "The next spell fails" hexes (#1475), stand-ins until the asset-designer's.
  // Hex: a struck-through spark with an arrow down, a spell at a foe fails.
  guilt: [
    "hex",
    (c) =>
      `<path d="M12 4v8M8 8h8" ${stroke(c, 2)}/><path d="M5 5l14 14" ${stroke(c, 1.8)}/>` +
      `<path d="M12 15v5M9.5 17.5L12 20l2.5-2.5" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a struck-through spark with an arrow up, a spell at an ally fails.
  shame: [
    "hex",
    (c) =>
      `<path d="M12 4v8M8 8h8" ${stroke(c, 2)}/><path d="M5 5l14 14" ${stroke(c, 1.8)}/>` +
      `<path d="M12 20v-5M9.5 17.5L12 15l2.5 2.5" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a struck-through spark bursting, the failed spell hurts around.
  mistrust: [
    "hex",
    (c) =>
      `<path d="M12 8v8M8 12h8" ${stroke(c, 2)}/><path d="M6 6l12 12" ${stroke(c, 1.8)}/>` +
      `<path d="M3 12h2M19 12h2M12 3v2M12 19v2" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a cracked drop, conditions coming and going hurt.
  fragility: [
    "hex",
    (c) =>
      `<path d="M12 3c3 4.5 5.5 7.5 5.5 11a5.5 5.5 0 0 1-11 0C6.5 10.5 9 7.5 12 3z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 9l-1.5 3 2.5 1.5-1.5 3" ${stroke(c, 1.5)}/>`,
  ],
  // Crowd punishers (#1501), stand-ins until the asset-designer's.
  // Hex: a broken ring round a burst, a skill used interrupts those near.
  panic: [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="7" ${stroke(c, 1.6)} stroke-dasharray="3 2.5"/>` +
      `<path d="M12 8v8M8 12h8M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: three rising bars, each second's pulse harder than the last.
  "wastrels-demise": ["hex", (c) => `<path d="M7 17v-3M12 17v-6M17 17v-9" ${stroke(c, 2.4)}/>`],
  // Mesmer staples (#1570), a stand-in until its art card.
  // Hex: a question mark in a doubled hourglass, spells take twice as long.
  "arcane-conundrum": [
    "hex",
    (c) =>
      `<path d="M7 5h10M7 19h10M8 5c0 4 8 4 8 7s-8 3-8 7M16 5c0 4-8 4-8 7" ${stroke(c, 1.6)}/>` +
      `<circle cx="12" cy="16.5" r="1" fill="${c}"/>`,
  ],
  // Clumsiness (#1593, #1619): the hex ring round a falling blade.
  // Hex: a blade dropped from a hand, the next attack is interrupted.
  clumsiness: [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="9" ${stroke(c, 1.8)} stroke-dasharray="4 3"/>` +
      `<path d="M7 17L16 8M10 12l3 3" ${stroke(c, 2.2)}/>`,
  ],
  // Dervish staples 2 (#1604).
  // Hex: an eye glancing aside over a burst, the next attack goes astray (#1666).
  "wandering-eye": [
    "hex",
    (c) =>
      `<path d="M3 9c3-4.5 6-6 9-6s6 1.5 9 6c-3 4.5-6 6-9 6s-6-1.5-9-6z" ${stroke(c, 1.8)}/>` +
      `<circle cx="15" cy="9" r="2" fill="${c}"/>` +
      `<path d="M12 17.5v3M8.5 18.5l2 1.5M15.5 18.5l-2 1.5" ${stroke(c, 1.6)}/>`,
  ],
  // Ally threshold mechanics (#1789, #1817): a Health bar and the line that answers.
  // Enchantment: a dashed, hazy heart over a bar at a quarter, it looks weaker than it is.
  "illusion-of-weakness": [
    "enchantment",
    (c) =>
      `<path d="M12 16s-5.5-3.4-5.5-7a3 3 0 0 1 5.5-1.7A3 3 0 0 1 17.5 9c0 3.6-5.5 7-5.5 7z" ${stroke(c, 1.8)} stroke-dasharray="2.4 2"/>` +
      `<path d="M8 10h8M9 13h6" ${stroke(c, 1.4)}/>` +
      `<rect x="3" y="18.5" width="18" height="3.5" rx="0.8" ${stroke(c, 1.8)}/>` +
      `<rect x="3" y="18.5" width="4.5" height="3.5" rx="0.8" fill="${c}"/>`,
  ],
  // "N for each X" (#1850): the skill's drawing, shrunk into the frame.
  channeling: [
    "enchantment",
    (c) =>
      `<g transform="translate(12,12) scale(0.62) translate(-12,-12)">${perEach("channeling", c, 2.8)}</g>`,
  ],
  // Caster staples (#1870), stand-ins until their art card.
  // Hex: a weight on a foot, moving slower; the energy comes back after.
  "ethereal-burden": [
    "hex",
    (c) => `<path d="M8 5h8l2 7H6z" fill="${c}"/>` + `<path d="M12 12v4M7 19h10" ${stroke(c, 2)}/>`,
  ],
  // Hex: three short bars, everything a third slower.
  "sum-of-all-fears": ["hex", (c) => `<path d="M6 7h8M6 12h8M6 17h8M17 5v14" ${stroke(c, 2.2)}/>`],
  // Caster staples 2 (#1872), stand-ins until their art card.
  // Stance: a shield struck by a bolt, armor against elements.
  "elemental-resistance": [
    "stance",
    (c) =>
      `<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" ${stroke(c, 2)}/>` +
      `<path d="M13 7l-3 5h4l-3 5" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: a shield struck by a blade, armor against blows.
  "physical-resistance": [
    "stance",
    (c) =>
      `<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" ${stroke(c, 2)}/>` +
      `<path d="M9 8l6 8M15 8l-6 8" ${stroke(c, 1.8)}/>`,
  ],
  // Casting-state hexes (#1931), stand-ins until their art card.
  // Hex: a bolt drawn out of a drop, each spell leaks Energy.
  "power-leech": [
    "hex",
    (c) =>
      `<path d="M12 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z" ${stroke(c, 1.8)}/>` +
      `<path d="M13 9l-3 4h4l-3 4" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a drop over two down chevrons, Energy draining away.
  "power-flux": [
    "hex",
    (c) =>
      `<path d="M12 3c2 2.6 3.5 4.3 3.5 6a3.5 3.5 0 0 1-7 0c0-1.7 1.5-3.4 3.5-6z" ${stroke(c, 1.8)}/>` +
      `<path d="M8 15l4 3 4-3M8 19l4 3 4-3" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect (#1929), a stand-in until its art card: a mask over
  // tally marks, spells counted down.
  "signet-of-illusions": [
    "skill-effect",
    (c) =>
      `<path d="M4 9q8-6 16 0q-8 7-16 0z" ${stroke(c, 2)}/>` +
      `<path d="M8 17v4M12 17v4M16 17v4" ${stroke(c, 1.6)}/>`,
  ],
  // Blocks that pay (#1974), a stand-in until its art card.
  // Stance: a shield, its edge rippling away, Energy lost to each block.
  distortion: [
    "stance",
    (c) =>
      `<path d="M7 5h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M4 20q2-2 4 0t4 0 4 0 4 0" ${stroke(c, 1.6)}/>`,
  ],
};
