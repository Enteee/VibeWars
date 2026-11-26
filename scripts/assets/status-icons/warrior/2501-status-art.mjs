import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2501), art #2517.
  // Stance: a marching boot with speed lines, faster under a chant or shout.
  "soldiers-speed": [
    "stance",
    (c) =>
      `<path d="M11 6h4v5l3.500 2.500V17H10v-3l1-1z" fill="${c}"/>` +
      `<path d="M4 9h4M4 12h4M4 15h3.500" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
