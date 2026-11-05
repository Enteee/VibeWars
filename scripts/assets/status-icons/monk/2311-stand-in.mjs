import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Vengeance (#2311), a stand-in until its art card.
  // Enchantment: an ankh over an upward arrow: back to life, hitting harder.
  vengeance: [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="7" r="3" ${stroke(c, 1.6)}/>` +
      `<path d="M12 10v9M8 13h8" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
