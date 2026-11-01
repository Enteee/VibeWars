import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Blocks that pay (#1974), a stand-in until its art card.
  // Stance: a shield, its edge rippling away, Energy lost to each block.
  distortion: [
    "stance",
    (c) =>
      `<path d="M7 5h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M4 20q2-2 4 0t4 0 4 0 4 0" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
