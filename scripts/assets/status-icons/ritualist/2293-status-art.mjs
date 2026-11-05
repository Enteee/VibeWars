import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Skill effect: a jagged life line under an arc, Health lost each second.
  agony: [
    "skill-effect",
    (c) =>
      `<path d="M3 15h4l2-6 3 10 3-8 1.500 4H21" ${stroke(c, 1.8)}/>` +
      `<path d="M6 5a9 9 0 0 1 12 0" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
