import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Condition movement (#2259, art #2273).
  // Item: an urn of ashes with a drop in it.
  "resilient-was-xiko": [
    "item",
    (c) =>
      `<path d="M8 4H16M9 4V7L6 11V17L8 20H16L18 17V11L15 7V4" ${stroke(c, 1.8)}/>` +
      `<path d="M12 11c-1.4 2-2 3-2 4a2 2 0 0 0 4 0c0-1-.6-2-2-4z" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
