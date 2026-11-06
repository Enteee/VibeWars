import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2479), stand-ins until their art card.
  // Skill effect: two figures bound by a line, one fate.
  "death-pact-signet": [
    "skill-effect",
    (c) =>
      `<circle cx="7" cy="8" r="2.5" ${stroke(c, 1.6)}/><circle cx="17" cy="8" r="2.5" ${stroke(c, 1.6)}/>` +
      `<path d="M7 11v8M17 11v8M7 15h10" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
