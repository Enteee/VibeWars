import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Minions 3 (#1915), stand-ins until their art card.
  // Skill effect: a fist over a skull, minions that hit harder.
  "order-of-undeath": [
    "skill-effect",
    (c) =>
      `<circle cx="12" cy="10" r="5" fill="${c}"/>` +
      `<path d="M9 18v2M12 18v2M15 18v2M5 5l3 3M19 5l-3 3" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
