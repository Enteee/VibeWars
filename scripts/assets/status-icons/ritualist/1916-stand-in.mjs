import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // "Not enchanted" (#1916), a stand-in until its art card.
  // Weapon spell: a blade with a plus, harder blows.
  "brutal-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M9 2v14M5 16h8M9 16v5" ${stroke(c, 2)}/>` +
      `<path d="M17 5v8M13 9h8" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
