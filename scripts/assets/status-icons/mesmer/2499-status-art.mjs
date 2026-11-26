import { fitRows, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Corpus skills on existing mechanics (#2499), art #2516.
  // Stance: an hourglass, the hex drawn out.
  "mantra-of-persistence": [
    "stance",
    (c) => `<path d="M7 5h10l-5 7 5 7H7l5-7z" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a heavy weight on its ring.
  "kitahs-burden": [
    "hex",
    (c) =>
      `<path d="M10 7.500a2 2 0 0 1 4 0" ${stroke(c, 1.5)}/><path d="M7.500 9.500h9l1.500 8h-12z" fill="${c}"/>`,
  ],
  // Stance: a signet ring with speed arcs behind it.
  "symbolic-posture": [
    "stance",
    (c) =>
      `<circle cx="9.500" cy="12.500" r="3.500" ${stroke(c, 1.7)}/><path d="M16 8.500a5 5 0 0 1 0 8M19 6a9 9 0 0 1 0 13" ${stroke(c, 1.5)}/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2404). */
const fits = { "symbolic-posture": [0.88, 0] };

export default fitRows(rows, fits);
