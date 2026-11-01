import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#1869), stand-in until its art card.
  // Stance: a leaping frog's two chevrons over three slashes, faster until an attack skill.
  "hekets-rampage": [
    "stance",
    (c) =>
      `<path d="M5 9l4-4 4 4M11 9l4-4 4 4" ${stroke(c, 2.2)}/>` +
      `<path d="M6.5 19l3-7M10.5 19l3-7M14.5 19l3-7" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
