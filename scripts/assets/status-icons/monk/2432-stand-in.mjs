import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Narrower filters (#2432), stand-ins until their art card.
  // Enchantment: a shield beside a ring, it blocks enchanted foes.
  "pensive-guardian": [
    "enchantment",
    (c) =>
      `<path d="M10 4l6 3v4c0 3-3 5-6 6-3-1-6-3-6-6V7z" ${stroke(c, 1.8)}/>` +
      `<circle cx="18" cy="17" r="3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
