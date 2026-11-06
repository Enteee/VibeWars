import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2470), art #2486.
  // Enchantment: an arched grave with an arc of light beside it, as the skill's.
  "unyielding-aura": [
    "enchantment",
    (c) =>
      `<path d="M8 18V12a3 3 0 0 1 6 0v6zM6.500 18h9" ${stroke(c, 1.8)}/>` +
      `<path d="M17 9q2 3 0 6" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
