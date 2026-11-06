import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Rank-scaled speed, reversal and next-hit cut (#2428), stand-ins until their art card.
  // Enchantment: a dagger beside a plus, each attack skill cures.
  "assassins-remedy": [
    "enchantment",
    (c) =>
      `<path d="M6 18 14 6M12 6h2v2" ${stroke(c, 2)}/>` +
      `<path d="M17 12v6M14 15h6" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
