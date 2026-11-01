import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Skill effect (#1929), a stand-in until its art card: a mask over
  // tally marks, spells counted down.
  "signet-of-illusions": [
    "skill-effect",
    (c) =>
      `<path d="M4 9q8-6 16 0q-8 7-16 0z" ${stroke(c, 2)}/>` +
      `<path d="M8 17v4M12 17v4M16 17v4" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
