import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Signet of Recall (#2374), art #2398.
  // Skill effect: a swing out and back, ending at a bolt.
  "signet-of-recall": [
    "skill-effect",
    (c) =>
      `<path d="M3 4c.500 10 6 16 14 14.500" ${stroke(c, 2)}/>` +
      `<path d="M16 15l6 4.500-6 3.500z" fill="${c}"/>` +
      `<path d="M19 2l-5 8h4l-1.500 6 6-8h-4z" fill="${c}"/>`,
  ],
};

export default rows;
