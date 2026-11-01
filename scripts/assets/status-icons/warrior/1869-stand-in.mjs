import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#1869), stand-ins until their art card.
  // Stance: a shield over three slashes, blocks but takes double damage.
  "frenzied-defense": [
    "stance",
    (c) =>
      `<path d="M7 4h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M6 21l2-4M11 21l2-4M16 21l2-4" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
