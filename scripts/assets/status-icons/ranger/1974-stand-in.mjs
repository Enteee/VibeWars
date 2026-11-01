import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Blocks that pay off (#1974), a stand-in until its art card.
  // Preparation: an arrow shattering into shards against a block.
  "glass-arrows": [
    "preparation",
    (c) =>
      `<path d="M3 21L13 11M9 7h6v6" ${stroke(c, 2)}/>` +
      `<path d="M17 4l2 3M20 9l-3 1M16 8l1-4" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
