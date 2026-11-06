import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ranger status art (#2277).
  // Stance: a circling arc, blocks and hurts who is adjacent.
  "whirling-defense": [
    "stance",
    (c) => `<path d="M17 8a6 6 0 1 0 1 6M18 5v4h-4" ${stroke(c, 2.2)}/>`,
  ],
  // Shout: a shield with a plus, the pet armoured.
  "otyughs-cry": [
    "shout",
    (c) =>
      `<path d="M7 5.5h10v5.5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" ${stroke(c, 2)}/>` +
      `<path d="M9.5 11h5M12 8.5v5" ${stroke(c, 2.2)}/>`,
  ],
  // Stance: a leaping frog's two chevrons over three slashes, faster until an attack skill.
  "hekets-rampage": [
    "stance",
    (c) =>
      `<path d="M5 9l4-4 4 4M11 9l4-4 4 4" ${stroke(c, 2.2)}/>` +
      `<path d="M6.5 19l3-7M10.5 19l3-7M14.5 19l3-7" ${stroke(c, 2)}/>`,
  ],
  // Skill: an arrowhead dripping poison.
  "poison-tip-signet": [
    "skill-effect",
    (c) =>
      `<path d="M4 20L14 10M10 6h8v8" ${stroke(c, 2)}/>` +
      `<path d="M18 16c-1.5 2-2 3-2 4a2 2 0 0 0 4 0c0-1-.5-2-2-4z" fill="${c}"/>`,
  ],
  // Stance: a bow with a plus, quicker and truer shots.
  "experts-dexterity": [
    "stance",
    (c) =>
      `<path d="M6 3c6 4 6 14 0 18M6 3v18" ${stroke(c, 2)}/>` +
      `<path d="M17 8v8M13 12h8" ${stroke(c, 2.2)}/>`,
  ],
  // Skill effect: sand running down, Energy lost to each act.
  quicksand: [
    "skill-effect",
    (c) =>
      `<path d="M6 5h12l-5 7 5 7H6l5-7z" ${stroke(c, 1.8)}/>` +
      `<path d="M10 17h4" ${stroke(c, 2)}/>`,
  ],
  // Preparation: an arrow shattering into shards against a block.
  "glass-arrows": [
    "preparation",
    (c) =>
      `<path d="M3 21L13 11M9 7h6v6" ${stroke(c, 2)}/>` +
      `<path d="M17 4l2 3M20 9l-3 1M16 8l1-4" ${stroke(c, 1.6)}/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2417). */
const fits = {
  "whirling-defense": [0.9, 0],
  "poison-tip-signet": [0.78, 0],
  "experts-dexterity": [0.8, 0],
  quicksand: [0.96, 0],
  "glass-arrows": [0.74, 3],
};

export default fitRows(rows, fits);
