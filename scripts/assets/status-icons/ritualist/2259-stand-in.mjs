import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Condition movement (#2259), stand-ins until their art card.
  // Item: an urn with a plus over it, regeneration per hex and condition.
  "resilient-was-xiko": [
    "item",
    (c) =>
      `<path d="M9 10h6l1 7a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 3v5M9.5 5.5h5" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
