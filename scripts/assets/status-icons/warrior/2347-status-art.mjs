import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Stance: two chevrons driving forward over a ground line.
  "charging-strike": [
    "stance",
    (c) =>
      `<path d="M4 6l5 5-5 5M11 6l5 5-5 5" ${stroke(c, 1.8)}/>` +
      `<path d="M4 20h16" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: a ring with a heart inside, more Health.
  "signet-of-stamina": [
    "skill-effect",
    (c) =>
      `<circle cx="12" cy="12" r="8.500" ${stroke(c, 1.8)}/>` +
      `<path d="M12 17l-4-4a2.500 2.500 0 0 1 4-3 2.500 2.500 0 0 1 4 3z" ${stroke(c, 1.6)}/>`,
  ],
  // Stance: a pennant leaning on its pole.
  "soldiers-stance": ["stance", (c) => `<path d="M7 21V3M7 4l12 4-12 4" ${stroke(c, 1.8)}/>`],
  // Stance: two feet on a level line with a brace bar over them.
  "steady-stance": [
    "stance",
    (c) =>
      `<path d="M8 11v6M16 11v6M4 20h16" ${stroke(c, 2)}/>` +
      `<path d="M6 6h12" ${stroke(c, 1.8)}/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2420). */
const fits = {
  "charging-strike": [0.9, 1],
  "signet-of-stamina": [0.84, 0],
  "soldiers-stance": [0.94, 2],
  "steady-stance": [0.92, 0],
};

export default fitRows(rows, fits);
