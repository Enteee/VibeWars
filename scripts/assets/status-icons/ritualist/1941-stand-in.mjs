import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Attributes raised (#1941), a stand-in until its art card.
  // Skill: a spirit's totem crowned, the next ritual's lord.
  "ritual-lord": [
    "skill-effect",
    (c) =>
      `<path d="M9 21V10h6v11M8 21h8" ${stroke(c, 2)}/>` +
      `<path d="M7 7l2.5-3 2.5 2 2.5-2 2.5 3z" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
