import { stroke } from "../../icon-kit.mjs";

/** The spirit post of the skill icons, small: a head on a stem. @param {string} c @param {number} x */
const post = (c, x) =>
  `<circle cx="${String(x)}" cy="9" r="2.200" fill="${c}"/>` +
  `<path d="M${String(x)} 12.500V17" ${stroke(c, 2.2)}/>`;

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2477, #2478, #2479), art #2487.
  // Skill effect: a post beside a plus, as the skill's.
  rejuvenation: ["skill-effect", (c) => post(c, 8) + `<path d="M15 9v6M12 12h6" ${stroke(c, 2)}/>`],
  // Skill effect: a post beside a drop with a speed line.
  recovery: [
    "skill-effect",
    (c) =>
      post(c, 8) +
      `<path d="M15.500 7c1.800 2.500 2.700 3.700 2.700 5.200a2.700 2.700 0 0 1-5.400 0c0-1.500.9-2.700 2.700-5.200z" fill="${c}"/>` +
      `<path d="M12.500 16.500h5" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a post beside a held bundle with a chevron over it.
  empowerment: [
    "skill-effect",
    (c) =>
      post(c, 8) +
      `<path d="M12.500 13.500h6v4h-6z" fill="${c}"/>` +
      `<path d="M13 10l2.500-2.500L18 10" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a post beside a turning arrow.
  "soul-twisting": [
    "skill-effect",
    (c) =>
      post(c, 8) +
      `<path d="M17 9a3 3 0 1 0 .6 3.800" ${stroke(c, 1.7)}/>` +
      `<path d="M18 6.800V9.300H15.500" ${stroke(c, 1.5)}/>`,
  ],
  // Skill effect: a signet ring beside a skull, as the skill's.
  "death-pact-signet": [
    "skill-effect",
    (c) =>
      `<circle cx="9" cy="9" r="3.500" ${stroke(c, 1.7)}/><circle cx="9" cy="9" r="1" fill="${c}"/>` +
      `<path d="M11.500 17.500v-2a2.800 2.800 0 1 1 5.600 0v2z" fill="${c}"/>`,
  ],
};

export default rows;
