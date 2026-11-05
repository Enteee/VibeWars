import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Skill effect: a keystone in an arch, the echo of the next signet.
  "keystone-signet": [
    "skill-effect",
    (c) =>
      `<path d="M4 21V12a8 8 0 0 1 16 0v9" ${stroke(c, 1.8)}/>` +
      `<path d="M9.500 3h5l-1 6h-3z" fill="${c}"/>`,
  ],
};

export default rows;
