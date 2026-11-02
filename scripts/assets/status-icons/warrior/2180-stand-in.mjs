import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Warrior mechanics 4 (#2180), stand-ins until their art card.
  // Stance: a chevron running right over two rising strokes, rage doubled.
  "battle-rage": [
    "stance",
    (c) =>
      `<path d="M7 6l6 6-6 6" ${stroke(c, 2.5)}/>` +
      `<path d="M15 18V9M19 18V6" ${stroke(c, 1.8)}/>`,
  ],
  // Shout: a shield with an arrow broken against it.
  "shields-up": [
    "shout",
    (c) =>
      `<path d="M14 5l5 2v4c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7V7z" ${stroke(c, 2)}/>` +
      `<path d="M3 12h4M5 10l2 2-2 2" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
