import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Touch and trap riders (#2069).
  // Skill effect: a claw over a limp line, your next hit Cripples.
  "strike-as-one": [
    "skill-effect",
    (c) =>
      `<path d="M6 5l4 9M11 4l3 10M16 5l2 9" ${stroke(c, 1.8)}/>` +
      `<path d="M5 19h14" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
