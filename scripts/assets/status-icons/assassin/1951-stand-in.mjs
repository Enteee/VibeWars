import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // PvP forms (#1951), a stand-in until its art card.
  // Enchantment: a hollow silhouette, untouchable while it lasts.
  "shadow-form": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="7" r="3" ${stroke(c, 2)} stroke-dasharray="2 2"/>` +
      `<path d="M6 20c0-5 3-8 6-8s6 3 6 8" ${stroke(c, 2)} stroke-dasharray="2 2"/>`,
  ],
};

export default rows;
