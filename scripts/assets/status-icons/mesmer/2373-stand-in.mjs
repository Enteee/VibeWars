import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Air of Disenchantment (#2373), a stand-in until its art card.
  // Hex: an hourglass whose sand runs out in a gust.
  "air-of-disenchantment": [
    "hex",
    (c) =>
      `<path d="M8 7h7L8 17h7z" ${stroke(c, 1.8)}/>` +
      `<path d="M16.5 12h2.5M16.5 9.5h1.5M16.5 14.5h1.5" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
