import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Corpus skills on existing mechanics (#2499), stand-ins until their art card.
  // Stance: a long bar, the hex drawn out.
  "mantra-of-persistence": ["stance", (c) => `<path d="M6 12h12M15 9l3 3-3 3" ${stroke(c, 1.8)}/>`],
  // Hex: a weight hung under a slow chevron.
  "kitahs-burden": [
    "hex",
    (c) =>
      `<path d="M9 8l3 3 3-3" ${stroke(c, 1.6)}/><path d="M8 17h8l-1-5h-6z" ${stroke(c, 1.6)}/>`,
  ],
  // Stance: a ring with a fast arc round it.
  "symbolic-posture": [
    "stance",
    (c) =>
      `<circle cx="12" cy="12" r="3" ${stroke(c, 1.6)}/><path d="M6 12a6 6 0 0 1 10-4.5M16 5v3h-3" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
