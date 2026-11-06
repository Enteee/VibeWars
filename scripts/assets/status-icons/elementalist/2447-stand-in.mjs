import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2447), stand-ins until their art card.
  // Hex: a small flame over three embers, fire each second.
  "smoldering-embers": [
    "hex",
    (c) =>
      `<path d="M12 4c2 3 4 4 4 7a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-2-1-4 0-6z" ${stroke(c, 1.8)}/>` +
      `<circle cx="7" cy="19" r="1.3" ${stroke(c, 1.5)}/>` +
      `<circle cx="12" cy="19" r="1.3" ${stroke(c, 1.5)}/>` +
      `<circle cx="17" cy="19" r="1.3" ${stroke(c, 1.5)}/>`,
  ],
};

export default rows;
