import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // PvP forms (#1951), stand-ins until their art card.
  // Enchantment: a flame over a hex's diamond, hexed foes set on fire.
  "elemental-flame": [
    "enchantment",
    (c) =>
      `<path d="M12 13l6 6H6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 3c3 3 3 5 0 8c-3-3-3-5 0-8z" fill="${c}"/>`,
  ],
};

export default rows;
