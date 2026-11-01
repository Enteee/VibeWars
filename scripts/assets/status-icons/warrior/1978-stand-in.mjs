import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Tactics stances that pay on a block (#1978), stand-ins until their art card.
  // Stance: a shield with a star, attack skills turned aside.
  "wary-stance": [
    "stance",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M12 8.5l1 2.2 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" ${stroke(c, 1.4)}/>`,
  ],
  // Stance: a shield under a raised banner, a block while a shout holds.
  "soldiers-defense": [
    "stance",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M12 9v6M12 9h4l-1 1.5 1 1.5h-4" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: a shield with a rising chevron, adrenaline when it ends.
  "defensive-stance": [
    "stance",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M9 13.5l3-3 3 3" ${stroke(c, 2)}/>`,
  ],
  // Stance: a shield with one bar, the next attack parried.
  "auspicious-parry": [
    "stance",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M9 9.5l6 5" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
