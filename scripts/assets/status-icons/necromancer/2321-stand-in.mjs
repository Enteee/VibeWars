import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Necromancer mechanics (#2321), stand-ins until their art card.
  // Hex: a drop rising over a burst: it bursts on those near as it ends.
  "rising-bile": [
    "hex",
    (c) =>
      `<path d="M12 3c2.5 3 3.5 5 3.5 6.5a3.5 3.5 0 0 1-7 0C8.5 8 9.5 6 12 3z" ${stroke(c, 1.6)}/>` +
      `<path d="M12 15v6M7 17l-2 3M17 17l2 3" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
