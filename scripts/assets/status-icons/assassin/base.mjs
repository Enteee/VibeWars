import { C, stepAndReturn, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Stance: an arrowhead trailing speed lines: run 50% faster.
  dash: [
    "stance",
    (c) =>
      `<path d="M20 14l-7-5v10z" fill="${c}"/>` +
      `<path d="M5 11h5M5 17h5M3.5 14h7" ${stroke(c, 2)}/>`,
  ],
  // Stance: a crescent moon, into the shadows: faster, half damage (#919).
  "dark-escape": [
    "stance",
    (c) => `<path d="M14.5 8a6 6 0 1 0 0 11a4.8 4.8 0 0 1 0-11z" fill="${c}"/>`,
  ],
  // Enchantment: a crescent over a plus, healed in the shadows (#988).
  "shadow-refuge": [
    "enchantment",
    (c) =>
      `<path d="M11 5a5 5 0 1 0 0 9a4 4 0 0 1 0-9z" fill="${c}"/>` +
      `<path d="M16.5 13v6M13.5 16h6" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a crescent inside a broken shield outline, armored while it holds back (#1349).
  "feigned-neutrality": [
    "enchantment",
    (c) =>
      `<path d="M12 3L19 5.8V11.5C19 15.8 16 18.8 12 20.8" ${stroke(c, 2)}/>` +
      `<path d="M12 3L5 5.8V11.5C5 15.8 8 18.8 12 20.8" ${stroke(c, 2)} stroke-dasharray="3 3"/>` +
      `<path d="M13 8a4 4 0 1 0 0 7a3.2 3.2 0 0 1 0-7z" fill="${c}"/>`,
  ],
  // Enchantment: a crescent beside a four-point spark and a plus, health from each critical hit (#1349).
  "way-of-perfection": [
    "enchantment",
    (c) =>
      `<path d="M9.5 3.5a5 5 0 1 0 0 9a4 4 0 0 1 0-9z" fill="${c}"/>` +
      `<path d="M16.5 8l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="${c}"/>` +
      `<path d="M7 17v5M4.5 19.5h5" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a shield, half filled, blocks below half Health (#988).
  "shroud-of-distress": [
    "enchantment",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M7 12h10c-.5 3-2.6 4.8-5 6-2.4-1.2-4.5-3-5-6z" fill="${c}"/>`,
  ],
  // Skill: an eye, more critical hits (#988).
  "critical-eye": [
    "skill-effect",
    (c) =>
      `<path d="M4 12.5c2-3.5 5-5.5 8-5.5s6 2 8 5.5c-2 3.5-5 5.5-8 5.5s-6-2-8-5.5z" ${stroke(c, 2)}/>` +
      `<circle cx="12" cy="12.5" r="2.5" fill="${c}"/>`,
  ],
  // Enchantment: a shield with a spark, blocks renewed by critical hits (#1315).
  "critical-defenses": [
    "enchantment",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M12 8.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="${c}"/>`,
  ],
  // Hex: a dashed ring with a gag bar, the foe cannot cast spells (#1234, #1262).
  "shroud-of-silence": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="6.5" ${stroke(c, 1.8)} stroke-dasharray="3.4 2.6"/>` +
      `<path d="M7.5 12h9" ${stroke(c, 2.6)}/>`,
  ],
  // Hex: a shield cracked open, blows of its caster cannot be blocked (#1234, #1262).
  "expose-defenses": [
    "hex",
    (c) =>
      `<path d="M12 5.5L18 7.8V12c0 3-2.5 5-6 6.5C8.5 17 6 15 6 12V7.8Z" ${stroke(c, 1.6)}/>` +
      `<path d="M12 7.5L10.5 11.5L13.5 13L11.5 16.5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a drop and a chevron, a poison that renews while its foe moves (#1234, #1262).
  "enduring-toxin": [
    "hex",
    (c) =>
      `<path d="M10 6c-2 2.6-3.5 4.4-3.5 6.2a3.5 3.5 0 0 0 7 0C13.5 10.4 12 8.6 10 6z" fill="${c}"/>` +
      `<path d="M15.5 8.5l3 3.5l-3 3.5" ${stroke(c, 2)}/>`,
  ],
  // Hex: a skull, healing on the foe is cut (#1234, #1262).
  "mark-of-death": [
    "hex",
    (c) =>
      `<path d="M12 5.5c-3 0-5 2-5 4.7c0 1.8 1 2.9 2.5 3.6V17h5v-3.2c1.5-.7 2.5-1.8 2.5-3.6c0-2.7-2-4.7-5-4.7z" fill="${c}"/>` +
      `<circle cx="10" cy="10.2" r="1.3" fill="${C.hex}"/><circle cx="14" cy="10.2" r="1.3" fill="${C.hex}"/>`,
  ],
  // Hex: the step arrowheads behind bars, it moves 66% slower.
  "shadow-prison": [
    "hex",
    (c) =>
      `<path d="M3 8L6 12L3 16Z" ${stroke(c, 1.4)}/>` +
      `<path d="M10 4V20M14 4V20M18 4V20M8 4.5H20M8 19.5H20" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: the step arrowheads dragged back by a bar, it moves 33% slower.
  "siphon-speed": [
    "hex",
    (c) =>
      `<path d="M5 8L9 12L5 16M11 8L15 12L11 16" ${stroke(c, 1.8)}/>` +
      `<path d="M19 5V19" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: the step arrowheads pulled forward, you move 33% faster.
  "siphon-speed-haste": [
    "skill-effect",
    (c) => `<path d="M4 8L8 12L4 16M10 8L14 12L10 16M16 8L20 12L16 16" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a fox head, the next attacks can't be blocked.
  "way-of-the-fox": [
    "enchantment",
    (c) =>
      `<path d="M3.5 3L9 8.5H15L20.5 3V12L12 21L3.5 12Z" ${stroke(c, 1.8)}/>` +
      `<path d="M9 12.5h.1M15 12.5h.1" ${stroke(c, 2.6)}/>`,
  ],
  // Death trigger (#1762, #1832): a skull and a recharge arrow.
  "assassins-promise": [
    "hex",
    (c) =>
      `<g transform="translate(12,12) scale(0.55) translate(-13,-13)">` +
      `<path d="M8 3.5a4.5 4.5 0 0 0-4.5 4.5c0 1.6.8 2.7 2 3.4V14H10.5V11.4c1.2-.7 2-1.8 2-3.4A4.5 4.5 0 0 0 8 3.5z" ${stroke(c, 3.2)}/>` +
      `<circle cx="6.2" cy="8" r="1.1" fill="${c}"/><circle cx="9.8" cy="8" r="1.1" fill="${c}"/>` +
      `<path d="M22.5 18a5 5 0 1 1-1.5-3.6M22.5 11.5V15H19" ${stroke(c, 3.6)}/>` +
      `</g>`,
  ],
  // Shadow Step and return (#1847): the skill's mark and way back, shrunk into the frame.
  "shadow-fang": [
    "hex",
    (c) =>
      `<g transform="translate(12,12) scale(0.55) translate(-12,-12)">${stepAndReturn("fang", c, 3.2)}</g>`,
  ],
  "aura-of-displacement": [
    "enchantment",
    (c) =>
      `<g transform="translate(12,12) scale(0.55) translate(-12,-12)">${stepAndReturn("aura", c, 3.2)}</g>`,
  ],
  "shadow-meld": [
    "enchantment",
    (c) =>
      `<g transform="translate(12,12) scale(0.55) translate(-12,-12)">${stepAndReturn("meld", c, 3.2)}</g>`,
  ],
  "shadow-of-haste": [
    "stance",
    (c) =>
      `<g transform="translate(12,12) scale(0.55) translate(-12,-12)">${stepAndReturn("haste", c, 3.2)}</g>`,
  ],
};

export default rows;
