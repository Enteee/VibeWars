import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2447), stand-ins until their art card.
  // Hex: a small flame over three embers, fire each second.
  "smoldering-embers": [
    "hex",
    (c) =>
      `<path d="M12 6c1.5 2 3 3 3 5a3 3 0 0 1-6 0c0-1.5.8-2.3 1.5-3 0 1.5.7 2.2 1.5 2.2 0-1.5-.8-2.8 0-4.2z" ${stroke(c, 1.7)}/>` +
      `<path d="M9.5 16h1M11.5 16h1M13.5 16h1" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
