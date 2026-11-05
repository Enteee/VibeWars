import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2316), stand-ins until their art card.
  // Stance: a forward chevron behind a blade point, the charge's blow.
  "charging-strike": [
    "stance",
    (c) =>
      `<path d="M4 7l5 5-5 5" ${stroke(c, 1.8)}/>` +
      `<path d="M11 12h9M17 9l3 3-3 3" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: a heart with a plus over it, more Health.
  "signet-of-stamina": [
    "skill-effect",
    (c) =>
      `<path d="M12 20l-6.5-6.5a3.6 3.6 0 0 1 6.5-4 3.6 3.6 0 0 1 6.5 4z" ${stroke(c, 1.9)}/>` +
      `<path d="M12 2.5v5M9.5 5h5" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: two fast swings under a raised call.
  "soldiers-stance": [
    "stance",
    (c) =>
      `<path d="M4 18l8-8M9 20l8-8" ${stroke(c, 1.8)}/>` +
      `<path d="M16 4l4 2-4 2" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: planted feet on a level line, not knocked down.
  "steady-stance": [
    "stance",
    (c) =>
      `<path d="M8 4v12M16 4v12" ${stroke(c, 1.8)}/>` + `<path d="M4 19h16" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
