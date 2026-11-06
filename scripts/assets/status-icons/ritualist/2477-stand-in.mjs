import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Healing spirits (#2477), stand-ins until their art card.
  // Skill effect: a plus under a pulse arc, healed each second.
  rejuvenation: [
    "skill-effect",
    (c) =>
      `<path d="M12 10v8M8 14h8" ${stroke(c, 2.2)}/>` +
      `<path d="M7 8q5-4 10 0" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a drop with speed lines, conditions run out faster.
  recovery: [
    "skill-effect",
    (c) =>
      `<path d="M14 7c2 3 3.200 4.500 3.200 6.300a3.200 3.200 0 0 1-6.400 0c0-1.800 1.200-3.300 3.200-6.300z" fill="${c}"/>` +
      `<path d="M5 11h4M4.500 14h4M5 17h4" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
