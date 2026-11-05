import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Condition movement (#2259, art #2273).
  // Shout: a heart with three calls fanned over it, the survivor's roar.
  "i-will-survive": [
    "shout",
    (c) =>
      `<path d="M12 20l-6.5-6.5a3.6 3.6 0 0 1 6.5-4 3.6 3.6 0 0 1 6.5 4z" ${stroke(c, 1.9)}/>` +
      `<path d="M12 2.5v2.5M5 4.5l1.6 1.8M19 4.5l-1.6 1.8" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
