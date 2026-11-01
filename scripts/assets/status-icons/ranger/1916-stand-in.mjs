import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Next attack (#1916), a stand-in until its art card.
  // Skill: an arrowhead dripping poison.
  "poison-tip-signet": [
    "skill-effect",
    (c) =>
      `<path d="M4 20L14 10M10 6h8v8" ${stroke(c, 2)}/>` +
      `<path d="M18 16c-1.5 2-2 3-2 4a2 2 0 0 0 4 0c0-1-.5-2-2-4z" fill="${c}"/>`,
  ],
};

export default rows;
