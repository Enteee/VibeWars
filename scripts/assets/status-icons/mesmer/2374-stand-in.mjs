import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Signet of Recall (#2374), a stand-in until its art card.
  // Skill effect: an arrow returning to a ring.
  "signet-of-recall": [
    "skill-effect",
    (c) =>
      `<circle cx="12" cy="12" r="7" ${stroke(c, 1.8)}/>` +
      `<path d="M12 5v7l4 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
