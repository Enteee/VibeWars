import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ranger staples 5 (#2133), stand-ins until their art card.
  // Preparation: an arrow striking a jagged break, the target's skill cut short.
  "disrupting-accuracy": [
    "preparation",
    (c) =>
      `<path d="M3 21L14 10M10 6h6v6" ${stroke(c, 2)}/>` +
      `<path d="M17 15l2 2-2 2 2 2" ${stroke(c, 1.6)}/>`,
  ],
  // Preparation: an arrow over a drop, Energy won or lost on each shot.
  "marksmans-wager": [
    "preparation",
    (c) =>
      `<path d="M3 13L13 3M9 3h4v4" ${stroke(c, 2)}/>` +
      `<path d="M17 12c-2 3-3 4.5-3 6a3 3 0 0 0 6 0c0-1.5-1-3-3-6z" ${stroke(c, 1.6)}/>`,
  ],
  // Stance: a lightning bolt with speed lines.
  "storm-chaser": [
    "stance",
    (c) =>
      `<path d="M14 3l-5 9h5l-3 9 7-11h-5l3-7z" ${stroke(c, 1.8)}/>` +
      `<path d="M3 9h4M2 13h4M3 17h4" ${stroke(c, 1.5)}/>`,
  ],
};

export default rows;
