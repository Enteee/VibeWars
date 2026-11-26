import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Counts and charges (#2373, #2438), art #2441.
  // Hex: a gust that blows a ring apart, as the skill's.
  "air-of-disenchantment": [
    "hex",
    (c) =>
      `<path d="M6.500 10H12A2 2 0 1 0 10.500 8M6.500 14.500H13A2 2 0 1 1 11.500 16" ${stroke(c, 1.6)}/>` +
      `<path d="M15 8A3.500 3.500 0 0 1 17.500 11M17.500 13.500A3.500 3.500 0 0 1 16.500 15.500" ${stroke(c, 1.4)}/>`,
  ],
  // Stance: a ward arch over three signet rings, as the skill's.
  "mantra-of-signets": [
    "stance",
    (c) =>
      `<path d="M6 10C6 7.500 8.500 6 12 5C15.500 6 18 7.500 18 10" ${stroke(c, 1.6)}/>` +
      `<circle cx="7.500" cy="15" r="2" ${stroke(c, 1.4)}/>` +
      `<circle cx="12" cy="15" r="2" ${stroke(c, 1.4)}/>` +
      `<circle cx="16.500" cy="15" r="2" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
