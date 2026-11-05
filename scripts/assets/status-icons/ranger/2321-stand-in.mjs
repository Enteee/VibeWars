import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ranger mechanics (#2321), stand-ins until their art card.
  // Skill effect: a circling arrow round a slow hourglass: casting takes longer.
  "natures-renewal": [
    "skill-effect",
    (c) =>
      `<path d="M9 7h6l-6 10h6z" ${stroke(c, 1.6)}/>` +
      `<path d="M19 12a7 7 0 1 1-2-5M17 3v4h-4" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a sun over a plus: more Overcast as a spell finishes.
  equinox: [
    "skill-effect",
    (c) =>
      `<circle cx="12" cy="9" r="3.5" ${stroke(c, 1.6)}/>` +
      `<path d="M12 2v2M5 9h2M17 9h2M7 4l1.5 1.5M17 4l-1.5 1.5M12 15v6M9 18h6" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a bow beside a lengthening bar: conditions last longer.
  "archers-signet": [
    "skill-effect",
    (c) =>
      `<path d="M7 3c5 4 5 14 0 18M7 3v18" ${stroke(c, 1.6)}/>` +
      `<path d="M12 12h9M18 9l3 3-3 3" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
