import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Signet of Suffering (#2333), a stand-in until its art card.
  // Skill: a signet ring with a drop in it, the next foe's bleeding.
  "signet-of-suffering": [
    "skill-effect",
    (c) =>
      `<circle cx="12" cy="12" r="8.5" ${stroke(c, 2)}/>` +
      `<path d="M12 7c2 3 3 4.5 3 6.5a3 3 0 0 1-6 0c0-2 1-3.5 3-6.5z" fill="${c}"/>`,
  ],
};

export default rows;
