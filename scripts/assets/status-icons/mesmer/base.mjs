import { perEach, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Stance: an arrow come round, spells back sooner (#938).
  "mantra-of-recovery": [
    "stance",
    (c) =>
      `<path d="M16.5 10.5A5 5 0 1 0 17 15" ${stroke(c, 2)}/>` +
      `<path d="M14 9.5l3.5-1 .5 3.5z" fill="${c}"/>`,
  ],
  // Stance: a bolt through a bar, Energy paid to stay uninterrupted.
  "mantra-of-resolve": [
    "stance",
    (c) => `<path d="M13 6l-4 7h5l-3 6" ${stroke(c, 2)}/><path d="M6 13h12" ${stroke(c, 1.6)}/>`,
  ],
  // Stance: an element's mark under a bar, its damage cut.
  "mantra-of-earth": ["stance", (c) => `<path d="M7 17l3-7 4 2 3 5z" fill="${c}"/>`],
  "mantra-of-flame": ["stance", (c) => `<path d="M12 7c3 3 3 6 0 10c-3-4-3-7 0-10z" fill="${c}"/>`],
  "mantra-of-frost": [
    "stance",
    (c) => `<path d="M12 7v10M7.5 9.5l9 5M7.5 14.5l9-5" ${stroke(c, 1.8)}/>`,
  ],
  "mantra-of-lightning": ["stance", (c) => `<path d="M13 6l-4 7h5l-3 6" ${stroke(c, 2)}/>`],
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
  // Hex: three rising bars, each second's pulse harder than the last.
  "wastrels-demise": ["hex", (c) => `<path d="M7 17v-3M12 17v-6M17 17v-9" ${stroke(c, 2.4)}/>`],
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
  // Hex: three short bars, everything a third slower.
  "sum-of-all-fears": ["hex", (c) => `<path d="M6 7h8M6 12h8M6 17h8M17 5v14" ${stroke(c, 2.2)}/>`],
  // Stance: a shield struck by a blade, armor against blows.
  "physical-resistance": [
    "stance",
    (c) =>
      `<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" ${stroke(c, 2)}/>` +
      `<path d="M9 8l6 8M15 8l-6 8" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a drop over two down chevrons, Energy draining away.
  "power-flux": [
    "hex",
    (c) =>
      `<path d="M12 3c2 2.6 3.5 4.3 3.5 6a3.5 3.5 0 0 1-7 0c0-1.7 1.5-3.4 3.5-6z" ${stroke(c, 1.8)}/>` +
      `<path d="M8 15l4 3 4-3M8 19l4 3 4-3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
