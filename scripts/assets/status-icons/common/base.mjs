import { C, germ, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Drop.
  bleeding: [
    "condition",
    (c) => `<path d="M12 4c3 4.5 5 7 5 9.5a5 5 0 0 1-10 0C7 11 9 8.5 12 4z" fill="${c}"/>`,
  ],
  // Flame: one tall tip leaning right and a side tongue, so it never reads
  // as the symmetric bleeding drop.
  burning: [
    "condition",
    (c) =>
      `<path d="M14 3.5c.5 3.5 4 5.5 4 10a6 6 0 0 1-12 0c0-2.5 1-4.5 2.5-5.5 0 2 .5 3 1.5 3.5-.5-3 1-6 4-8z" fill="${c}"/>`,
  ],
  // Three bubbles.
  poison: [
    "condition",
    (c) =>
      `<circle cx="9" cy="14.5" r="3" fill="${c}"/>` +
      `<circle cx="15.5" cy="13" r="2.2" fill="${c}"/>` +
      `<circle cx="12" cy="7.5" r="1.8" fill="${c}"/>`,
  ],
  // Broken step: a line that kinks and drops.
  crippled: ["condition", (c) => `<path d="M5 9h6l2 6h6" ${stroke(c, 2.5)}/>`],
  // Eye, struck through.
  blind: [
    "condition",
    (c) =>
      `<path d="M4.5 12c2-3.5 4.5-5 7.5-5s5.5 1.5 7.5 5c-2 3.5-4.5 5-7.5 5s-5.5-1.5-7.5-5z" ${stroke(c, 2)}/>` +
      `<path d="M6 18L18 6" ${stroke(c, 2.5)}/>`,
  ],
  // Arrow down: you hit softer.
  weakness: ["condition", (c) => `<path d="M12 5v13M7 13l5 5 5-5" ${stroke(c, 2.5)}/>`],
  // A shield split by a crack: your armor gives (#763).
  "cracked-armor": [
    "condition",
    (c) =>
      `<path d="M6.5 5.5h11v5.5c0 3.5-2.5 5.5-5.5 7.5-3-2-5.5-4-5.5-7.5z" fill="${c}"/>` +
      `<path d="M12.5 5.5l-2 4 3 2-2.5 4" ${stroke(C.condition, 1.6)}/>`,
  ],
  // Cross cut.
  "deep-wound": ["condition", (c) => `<path d="M7 7l10 10M17 7L7 17" ${stroke(c, 3)}/>`],
  // Five-point star: seeing stars.
  dazed: [
    "condition",
    (c) =>
      `<path d="M12 4.5l2.2 4.6 5 .6-3.7 3.5 1 5L12 15.8l-4.5 2.4 1-5-3.7-3.5 5-.6z" fill="${c}"/>`,
  ],
  // A germ: it catches.
  disease: ["condition", germ],
};

export default rows;
