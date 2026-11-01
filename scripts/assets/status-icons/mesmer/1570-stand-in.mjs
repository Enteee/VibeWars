import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mesmer staples (#1570), a stand-in until its art card.
  // Hex: a question mark in a doubled hourglass, spells take twice as long.
  "arcane-conundrum": [
    "hex",
    (c) =>
      `<path d="M7 5h10M7 19h10M8 5c0 4 8 4 8 7s-8 3-8 7M16 5c0 4-8 4-8 7" ${stroke(c, 1.6)}/>` +
      `<circle cx="12" cy="16.5" r="1" fill="${c}"/>`,
  ],
};

export default rows;
