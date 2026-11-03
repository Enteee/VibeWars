import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mesmer status art (#2276).
  // Hex: a four-point spark struck through, the next spell fails.
  guilt: [
    "hex",
    (c) =>
      `<path d="M12 4l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" ${stroke(c, 1.7)}/>` +
      `<path d="M4.5 19.5L19.5 4.5" ${stroke(c, 2)}/>`,
  ],
  // Hex: a warning mark in a broken ring.
  panic: [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="9" ${stroke(c, 1.6)} stroke-dasharray="3.5 2.6"/>` +
      `<path d="M12 6.5v7" ${stroke(c, 2.6)}/>` +
      `<circle cx="12" cy="17.2" r="1.5" fill="${c}"/>`,
  ],
  // Hex: a question mark in a doubled hourglass, spells take twice as long.
  "arcane-conundrum": [
    "hex",
    (c) =>
      `<path d="M7 4h10M7 20h10M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8" ${stroke(c, 1.6)}/>` +
      `<circle cx="12" cy="16.5" r="1" fill="${c}"/>`,
  ],
  // Hex: a weight with its ring handle, moving slower.
  "ethereal-burden": [
    "hex",
    (c) =>
      `<path d="M8 9h8l2.5 10h-13z" fill="${c}"/>` +
      `<path d="M9.5 9a2.5 3.5 0 0 1 5 0" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: a shield, its near half solid, armor against the elements.
  "elemental-resistance": [
    "stance",
    (c) =>
      `<path d="M12 3L5 6v6c0 4 3 7 7 9z" fill="${c}"/>` +
      `<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: an eye with tally marks, spells counted down.
  "signet-of-illusions": [
    "skill-effect",
    (c) =>
      `<path d="M3 9q9-7 18 0q-9 7-18 0z" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="9" r="1.8" fill="${c}"/>` +
      `<path d="M8 17v4M12 17v4M16 17v4" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a bolt drawn out of a drop, each spell leaks Energy.
  "power-leech": [
    "hex",
    (c) =>
      `<path d="M12 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z" ${stroke(c, 1.8)}/>` +
      `<path d="M13 9l-3 4h4l-3 4" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: an unbroken ring round a held point, the next interrupt shrugged off.
  "mantra-of-concentration": [
    "stance",
    (c) =>
      `<circle cx="12" cy="12" r="7" ${stroke(c, 2.2)}/>` +
      `<circle cx="12" cy="12" r="2" fill="${c}"/>`,
  ],
  // Stance: a shield, its edge rippling away, Energy lost to each block.
  distortion: [
    "stance",
    (c) =>
      `<path d="M7 4h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M4 20q2-2 4 0t4 0 4 0 4 0" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
