import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Air of Disenchantment (#2373), a stand-in until its art card.
  // Hex: an hourglass whose sand runs out in a gust.
  "air-of-disenchantment": [
    "hex",
    (c) =>
      `<path d="M7 4h10L7 20h10z" ${stroke(c, 1.8)}/>` +
      `<path d="M17 12h4M18 9h3M18 15h3" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
