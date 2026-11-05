import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Skill: a bleeding drop with an arrow after it, the next foe's wound.
  "signet-of-suffering": [
    "skill-effect",
    (c) =>
      `<path d="M9 6c2 3 3.500 4.500 3.500 6.500a3.500 3.500 0 0 1-7 0C5.500 10.500 7 9 9 6z" fill="${c}"/>` +
      `<path d="M14 12h5M17 9.500l2.500 2.500-2.500 2.500" ${stroke(c, 1.7)}/>`,
  ],
};

export default rows;
