import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Weapon gates (#2335), stand-ins until their art card.
  // Skill effect: a blade passing through a broken guard, unblockable.
  "warriors-cunning": [
    "skill-effect",
    (c) =>
      `<path d="M5 19L19 5M15 5h4v4" ${stroke(c, 1.8)}/>` +
      `<path d="M4 8v4M8 4h4" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: a hammer head over a planted line.
  "dwarven-battle-stance": [
    "stance",
    (c) =>
      `<path d="M7 5h10v5H7zM12 10v8" ${stroke(c, 1.8)}/>` +
      `<path d="M4 20h16" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
