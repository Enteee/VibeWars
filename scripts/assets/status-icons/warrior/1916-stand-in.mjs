import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Next attacks (#1916), a stand-in until its art card.
  // Skill: a sword over tally marks, blows counted down.
  "signet-of-strength": [
    "skill-effect",
    (c) =>
      `<path d="M12 2v12M8 14h8M12 14v3" ${stroke(c, 2)}/>` +
      `<path d="M7 19v3M10.5 19v3M14 19v3M17.5 19v3" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
