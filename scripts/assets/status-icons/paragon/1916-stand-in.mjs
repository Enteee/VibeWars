import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // "Not enchanted" (#1916), a stand-in until its art card.
  // Skill: two rising bars with a chevron, a little more adrenaline.
  "natural-temper": [
    "skill-effect",
    (c) =>
      `<path d="M8 19v-5M14 19v-9" ${stroke(c, 2.4)}/>` +
      `<path d="M15 5.5l3-3 3 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
