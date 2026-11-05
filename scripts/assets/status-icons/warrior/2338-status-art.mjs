import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Shout: a heart under three rising bars, health spent, adrenaline climbing.
  "to-the-limit": [
    "shout",
    (c) =>
      `<path d="M12 21l-5.500-5.500a3 3 0 0 1 5.500-3.400 3 3 0 0 1 5.500 3.400z" ${stroke(c, 1.9)}/>` +
      `<path d="M6 9V7M12 9V4M18 9V2.500" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
