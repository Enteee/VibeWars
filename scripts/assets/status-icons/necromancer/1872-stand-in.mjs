import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Caster staples 2 (#1872), stand-ins until their art card.
  // Hex: a mouth crossed out, no shouts or chants.
  "vocal-minority": [
    "hex",
    (c) =>
      `<path d="M6 12c2-3 10-3 12 0-2 3-10 3-12 0z" ${stroke(c, 2)}/>` +
      `<path d="M5 19L19 5" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
