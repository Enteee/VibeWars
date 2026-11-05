import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Warrior shouts that count (#2320), stand-ins until their art card.
  // Shout: a cross over a fallen line, a plus rising beside it.
  "i-will-avenge-you": [
    "shout",
    (c) =>
      `<path d="M8 4v12M4 8h8" ${stroke(c, 1.9)}/>` +
      `<path d="M3 20h18" ${stroke(c, 2)}/>` +
      `<path d="M18 6v6M15 9h6" ${stroke(c, 1.8)}/>`,
  ],
  // Shout: a still dot in a target ring, a call above it.
  "fear-me": [
    "shout",
    (c) =>
      `<circle cx="12" cy="14" r="6" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="14" r="1.6" ${stroke(c, 1.8)}/>` +
      `<path d="M8 4.5l4-2 4 2" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: three fast chevrons over an emptied gauge.
  "burst-of-aggression": [
    "stance",
    (c) =>
      `<path d="M4 5l4 4-4 4M10 5l4 4-4 4M16 5l4 4-4 4" ${stroke(c, 1.8)}/>` +
      `<path d="M4 19h16" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
