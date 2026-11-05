import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Paragon staples (#2222), art #2253.
  // Chant: a bolt over rising bars, Energy flowing until a skill is used.
  "song-of-power": [
    "chant",
    (c) =>
      `<path d="M13 4l-4 7h5l-3 6" ${stroke(c, 2)}/>` +
      `<path d="M6 20v-3M12 20v-2M18 20v-4" ${stroke(c, 2)}/>`,
  ],
  // Chant: a plus over a broken bar, healed the next time you are hit.
  "ballad-of-restoration": [
    "chant",
    (c) =>
      `<path d="M12 4v8M8 8h8" ${stroke(c, 2.4)}/>` +
      `<path d="M5 17h5l2 2 2-2h5" ${stroke(c, 2)}/>`,
  ],
  // Shout: a flame behind a bar held across it, less damage from burning foes.
  "theyre-on-fire": [
    "shout",
    (c) =>
      `<path d="M12 4c3 4 4 6 4 9a4 4 0 0 1-8 0c0-3 1-5 4-9z" ${stroke(c, 1.8)}/>` +
      `<path d="M5 15h14" ${stroke(c, 2.4)}/>`,
  ],
  // Shout: a star burst over a deep cross cut, your next critical wounds.
  "find-their-weakness": [
    "shout",
    (c) =>
      `<path d="M12 4v5M9.5 6.5h5" ${stroke(c, 2)}/>` +
      `<path d="M7 12l10 8M17 12l-10 8" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
