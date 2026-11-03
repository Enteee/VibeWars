import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Condition movement (#2259), stand-ins until their art card.
  // Shout: a heart with an arrow rising out of it, regeneration per condition.
  "i-will-survive": [
    "shout",
    (c) =>
      `<path d="M12 19l-6-6a3.5 3.5 0 0 1 6-4 3.5 3.5 0 0 1 6 4z" ${stroke(c, 2)}/>` +
      `<path d="M12 15V4M9.5 6.5L12 4l2.5 2.5" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
