import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ritualist staples (#2212), art #2253.
  // Skill: a bolt inside a ring, the ally's foes struck each second.
  "ancestors-rage": [
    "skill-effect",
    (c) =>
      `<circle cx="12" cy="12" r="8" ${stroke(c, 1.8)}/>` +
      `<path d="M13 6l-3 6h4l-3 6" ${stroke(c, 2)}/>`,
  ],
  // Hex: a blade with a blunt, notched tip, no criticals and less damage.
  "dulled-weapon": [
    "hex",
    (c) =>
      `<path d="M6 18l9-9h3v3l-9 9" ${stroke(c, 2)}/>` +
      `<path d="M4 16l4 4M15 6l3 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
