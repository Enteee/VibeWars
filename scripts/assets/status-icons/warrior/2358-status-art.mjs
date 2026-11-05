import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Skill effect: an arrow passing through a ring, unblockable.
  "warriors-cunning": [
    "skill-effect",
    (c) =>
      `<path d="M3 12h15M15 9.500l3 2.500-3 2.500" ${stroke(c, 1.6)}/>` +
      `<path d="M10 7v10" ${stroke(c, 1.4)}/>`,
  ],
  // Stance: a hammer head over a small shield.
  "dwarven-battle-stance": [
    "stance",
    (c) =>
      `<path d="M7 4h10v4H7zM12 8v3" ${stroke(c, 1.7)}/>` +
      `<path d="M8.500 11.500h7v3c0 2-3.500 4-3.500 4s-3.500-2-3.500-4z" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
