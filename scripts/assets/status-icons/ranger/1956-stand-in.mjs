import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Nature rituals 4 (#1956), stand-ins until their art card. Skill
  // effect: sand running down, Energy lost to each act.
  quicksand: [
    "skill-effect",
    (c) =>
      `<path d="M6 5h12l-5 7 5 7H6l5-7z" ${stroke(c, 1.8)}/>` +
      `<path d="M10 17h4" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
