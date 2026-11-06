import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ranger staples (#2317) and mechanics (#2321), art #2397.
  // Preparation: a cloud with a cross in it, spells choked off.
  "choking-gas": [
    "preparation",
    (c) =>
      `<path d="M7 17a3.500 3.500 0 0 1 0-7 5 5 0 0 1 10 0 3.500 3.500 0 0 1 0 7z" ${stroke(c, 1.7)}/>` +
      `<path d="M10 11.500 14 15M14 11.500 10 15" ${stroke(c, 1.5)}/>`,
  ],
  // Stance: a shield with a leaf in it.
  "dryders-defenses": [
    "stance",
    (c) =>
      `<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 16c-4-1.500-3.500-5.500 0-8 3.500 2.500 4 6.500 0 8z" ${stroke(c, 1.4)}/>`,
  ],
  // Stance: three curved claw gashes, a pet in a frenzy.
  "bestial-fury": [
    "stance",
    (c) => `<path d="M7 5c-1 5 0 9 2 14M12 5c-1 5 0 9 2 14M17 5c-1 5 0 9 2 14" ${stroke(c, 1.9)}/>`,
  ],
  // Skill effect: a hooked beak over a drop, Energy from a suffering foe.
  "scavengers-focus": [
    "skill-effect",
    (c) =>
      `<path d="M3 5c7-1 13 2 13 7l-3-2.500C11 8.500 7 8 3 8z" ${stroke(c, 1.6)}/>` +
      `<path d="M14 14c2 3 2.500 4 2.500 5a2.500 2.500 0 0 1-5 0c0-1 .5-2 2.500-5z" ${stroke(c, 1.5)}/>`,
  ],
  // Skill effect: a paw print with a bolt, the pet's speed.
  "feral-aggression": [
    "skill-effect",
    (c) =>
      `<path d="M12 12c4 0 5.500 2.500 5.500 4.500a2.500 2.500 0 0 1-3 2.500c-1 0-1.500-.5-2.500-.5s-1.500.5-2.500.5a2.500 2.500 0 0 1-3-2.500C6.500 14.500 8 12 12 12z" ${stroke(c, 1.5)}/>` +
      `<circle cx="6" cy="10" r="1.200" ${stroke(c, 1.3)}/><circle cx="10" cy="6" r="1.200" ${stroke(c, 1.3)}/>` +
      `<circle cx="14" cy="6" r="1.200" ${stroke(c, 1.3)}/><circle cx="18" cy="10" r="1.200" ${stroke(c, 1.3)}/>`,
  ],
  // Skill effect: a leaf in a circling arrow, the ritual that renews itself.
  "natures-renewal": [
    "skill-effect",
    (c) =>
      `<path d="M19 12a7 7 0 1 1-7-7" ${stroke(c, 1.6)}/><path d="M12 2.500 15 5l-3 2.500" ${stroke(c, 1.5)}/>` +
      `<path d="M12 16c-3-1.500-2.500-4.500 0-6.500C14.500 11.500 15 14.500 12 16z" ${stroke(c, 1.4)}/>`,
  ],
  // Skill effect: a half sun on a horizon.
  equinox: [
    "skill-effect",
    (c) =>
      `<path d="M7 16a5 5 0 0 1 10 0z" ${stroke(c, 1.6)}/>` +
      `<path d="M3 19h18M12 6v3M5.500 9l1.500 1.500M18.500 9 17 10.500" ${stroke(c, 1.5)}/>`,
  ],
  // Skill effect: a bow with a long arrow, conditions that last longer.
  "archers-signet": [
    "skill-effect",
    (c) =>
      `<path d="M6 4c7 3 7 13 0 16M6 4v16" ${stroke(c, 1.6)}/>` +
      `<path d="M9 12h11M17 9l3 3-3 3" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
