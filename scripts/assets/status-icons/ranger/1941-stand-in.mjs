import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Attributes raised (#1941), a stand-in until its art card.
  // Stance: a bow with a plus, quicker and truer shots.
  "experts-dexterity": [
    "stance",
    (c) =>
      `<path d="M6 3c6 4 6 14 0 18M6 3v18" ${stroke(c, 2)}/>` +
      `<path d="M17 8v8M13 12h8" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
