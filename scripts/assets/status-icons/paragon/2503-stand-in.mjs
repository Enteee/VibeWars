import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2503), stand-ins until their art card.
  // Skill effect: a heart under a cap line.
  "angelic-protection": [
    "skill-effect",
    (c) =>
      `<path d="M12 11c-2-2-4-1-4 1s4 4 4 4 4-2 4-4-2-3-4-1z" fill="${c}"/>` +
      `<path d="M8 8h8" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
