import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Skill-type and heal triggers (#1913), a stand-in until its art card.
  // Enchantment: a quill over a spark, Energy for each signet.
  "scribes-insight": [
    "enchantment",
    (c) =>
      `<path d="M18 3L8 13l-2 5 5-2L21 6z" fill="${c}"/>` + `<path d="M4 21h8" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
