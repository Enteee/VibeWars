import { stroke, fitRows } from "../../icon-kit.mjs";

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

/** Drawn smaller to sit inside the plate (#2417). */
const fits = {
  "strike-as-one": [0.9, 0],
};

export default fitRows(rows, fits);
