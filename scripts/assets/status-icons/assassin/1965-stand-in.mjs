import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Take what another has (#1965), a stand-in until its art card.
  // Hex: a stance and its mirror image either side of a line.
  "mirrored-stance": [
    "hex",
    (c) =>
      `<path d="M12 3v18" ${stroke(c, 1.5)} stroke-dasharray="2 2"/>` +
      `<path d="M9 6l-4 6 4 6" ${stroke(c, 2)}/>` +
      `<path d="M15 6l4 6-4 6" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
