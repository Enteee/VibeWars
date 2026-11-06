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
  // Stance: a sword with speed marks, faster blows.
  "burst-of-aggression": [
    "stance",
    (c) =>
      `<path d="M19 5 9 15" ${stroke(c, 2.2)}/>` +
      `<path d="M6.500 12.500 11.500 17.500M8.500 15 5 19" ${stroke(c, 1.8)}/>` +
      `<path d="M4 5h6M4 8.500h3" ${stroke(c, 1.5)}/>`,
  ],
};

export default rows;
