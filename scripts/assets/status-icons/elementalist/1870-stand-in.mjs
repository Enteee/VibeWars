import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Caster staples (#1870), stand-ins until their art card.
  // Hex: hands of earth closing on a foot, moving slower.
  "grasping-earth": [
    "hex",
    (c) =>
      `<path d="M4 19h16" ${stroke(c, 2.4)}/>` +
      `<path d="M7 19V12M10 19V9M14 19V9M17 19V12" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
