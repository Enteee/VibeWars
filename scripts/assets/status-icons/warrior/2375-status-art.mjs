import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Warrior shouts that count (#2320), art #2375.
  // Shout: a headstone with a plus in it, the fallen made strength.
  "i-will-avenge-you": [
    "shout",
    (c) =>
      `<path d="M6 20V10a6 6 0 0 1 12 0v10z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 8v6M9 11h6" ${stroke(c, 1.7)}/>`,
  ],
  // Shout: a screaming face, the fear it puts in them.
  "fear-me": [
    "shout",
    (c) =>
      `<circle cx="12" cy="12" r="8" ${stroke(c, 1.8)}/>` +
      `<path d="M9 10v1.500M15 10v1.500" ${stroke(c, 1.8)}/>` +
      `<ellipse cx="12" cy="16" rx="2" ry="2.500" ${stroke(c, 1.5)}/>`,
  ],
  // Stance: three chevrons rushing right, speed with the guard lowered.
  "burst-of-aggression": [
    "stance",
    (c) => `<path d="M4 6l5 6-5 6M10 6l5 6-5 6M16 6l5 6-5 6" ${stroke(c, 1.9)}/>`,
  ],
};

export default rows;
