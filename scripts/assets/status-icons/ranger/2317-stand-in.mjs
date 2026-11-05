import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ranger staples (#2317), stand-ins until their art card.
  // Preparation: an arrow trailing a puff of gas, spells choked off.
  "choking-gas": [
    "preparation",
    (c) =>
      `<path d="M3 21l11-11M14 10l-1 4M14 10l-4 1" ${stroke(c, 1.8)}/>` +
      `<circle cx="17" cy="7" r="3" ${stroke(c, 1.6)}/>` +
      `<circle cx="20.5" cy="12" r="1.8" ${stroke(c, 1.4)}/>`,
  ],
  // Stance: a shield with a flame struck off its face.
  "dryders-defenses": [
    "stance",
    (c) =>
      `<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 9c2 2 2 4 0 6-2-2-2-4 0-6z" fill="${c}"/>`,
  ],
  // Stance: three claw gashes under a bolt, faster attacks.
  "bestial-fury": [
    "stance",
    (c) =>
      `<path d="M6 11l-1 9M12 11v9M18 11l1 9" ${stroke(c, 2)}/>` +
      `<path d="M13 2l-4 5h4l-3 3" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a claw over a drop, energy from a suffering foe.
  "scavengers-focus": [
    "skill-effect",
    (c) =>
      `<path d="M5 4l3 8M10 3l2 9M15 4l-1 8" ${stroke(c, 1.8)}/>` +
      `<path d="M12 14c2.5 3 3 4.5 3 5.5a3 3 0 0 1-6 0c0-1 .5-2.5 3-5.5z" fill="${c}"/>`,
  ],
  // Skill effect: a paw print with speed lines, the pet's fury.
  "feral-aggression": [
    "skill-effect",
    (c) =>
      `<circle cx="14" cy="15" r="4" fill="${c}"/>` +
      `<circle cx="10" cy="9" r="1.6" fill="${c}"/><circle cx="14" cy="7.5" r="1.6" fill="${c}"/>` +
      `<circle cx="18" cy="9" r="1.6" fill="${c}"/>` +
      `<path d="M2 12h5M3 16h4M2 20h6" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
