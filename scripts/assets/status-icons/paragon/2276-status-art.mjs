import { inset, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Paragon status art (#2276).
  // Chant: a bolt beside a blade, Energy with your next attack skill.
  "zealous-anthem": [
    "chant",
    (c) =>
      inset(
        1,
        `<path d="M10 3L4 13h4l-1 8 6-10H9z" fill="${c}"/>` +
          `<path d="M18 4v11M15.5 15h5" ${stroke(c, 2)}/>`,
        -0.5,
        0,
      ),
  ],
  // Chant: two bars held level round a point, your next skill cannot be interrupted.
  "song-of-concentration": [
    "chant",
    (c) =>
      `<path d="M5 8h14M5 16h14" ${stroke(c, 2.2)}/>` +
      `<circle cx="12" cy="12" r="1.6" fill="${c}"/>`,
  ],
  // Skill: two rising bars with a chevron, a little more adrenaline.
  "natural-temper": [
    "skill-effect",
    (c) =>
      inset(
        0.86,
        `<path d="M8 19v-5M14 19v-9" ${stroke(c, 2.4)}/>` +
          `<path d="M15 5.5l3-3 3 3" ${stroke(c, 1.8)}/>`,
        -1,
        1,
      ),
  ],
};

export default rows;
