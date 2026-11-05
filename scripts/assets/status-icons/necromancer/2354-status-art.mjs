import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Skill: a bleeding drop with an arrow after it, the next foe's wound.
  "signet-of-suffering": [
    "skill-effect",
    (c) =>
      `<path d="M9 4c2.500 3.500 4 5 4 7a4 4 0 0 1-8 0c0-2 1.500-3.500 4-7z" fill="${c}"/>` +
      `<path d="M13 19h8M18 16l3 3-3 3" ${stroke(c, 1.7)}/>`,
  ],
};

export default rows;
