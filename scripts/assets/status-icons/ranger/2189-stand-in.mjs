import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ranger mechanics (#2189), stand-ins until their art card.
  // Stance: a leaf over two rising strokes, regeneration from suffering.
  "melandrus-resilience": [
    "stance",
    (c) =>
      `<path d="M5 13c0-5 4-8 9-8 0 5-3 9-9 8z" ${stroke(c, 2)}/>` +
      `<path d="M15 20v-6M19 20v-9" ${stroke(c, 1.8)}/>`,
  ],
  // Preparation: an arrow into a ring, the focused shot.
  "expert-focus": [
    "preparation",
    (c) =>
      `<circle cx="15" cy="12" r="5" ${stroke(c, 2)}/>` +
      `<path d="M3 12h12M12 9l3 3-3 3" ${stroke(c, 1.8)}/>`,
  ],
  // Preparation: two arrows in quick succession.
  "rapid-fire": [
    "preparation",
    (c) =>
      `<path d="M3 8h15M15 5l3 3-3 3" ${stroke(c, 1.8)}/>` +
      `<path d="M6 16h15M18 13l3 3-3 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
