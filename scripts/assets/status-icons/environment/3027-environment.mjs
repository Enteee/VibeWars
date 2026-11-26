import { C, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // An arrow sinking into a wave: the mire holds you.
  mired: [
    "environment",
    (c) =>
      `<path d="M12 5v7M9 9.5l3 3 3-3" ${stroke(c, 2.5)}/>` +
      `<path d="M5 17q2-2 3.5 0t3.5 0 3.5 0 3.5 0" ${stroke(c, 2)}/>`,
  ],
  // A drop with a scum line across it: foul water.
  fouled: [
    "environment",
    (c) =>
      `<path d="M12 5.5c-3 4-4.5 6.3-4.5 8.5a4.5 4.5 0 0 0 9 0c0-2.2-1.5-4.5-4.5-8.5z" fill="${c}"/>` +
      `<path d="M10.5 15.5h3" ${stroke(C.environment, 1.5)}/>`,
  ],
};

export default rows;
