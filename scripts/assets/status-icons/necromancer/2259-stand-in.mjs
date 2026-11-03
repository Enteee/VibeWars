import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Condition movement (#2259), stand-ins until their art card.
  // Hex: a target mark with a crack through it, fury now and armor broken after.
  "mark-of-fury": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="7" ${stroke(c, 1.8)}/>` +
      `<path d="M12 5l-1.5 4 3 2-2 3 1 5" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
