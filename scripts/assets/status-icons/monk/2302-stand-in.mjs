import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Balthazar's Spirit (#2302), a stand-in until its art card.
  // Enchantment: a flame over three rising bars, adrenaline for every blow taken.
  "balthazars-spirit": [
    "enchantment",
    (c) =>
      `<path d="M12 3c2.5 3 4 4.5 4 7a4 4 0 0 1-8 0c0-2.5 1.5-4 4-7z" ${stroke(c, 1.6)}/>` +
      `<path d="M7 21v-3M12 21v-5M17 21v-7" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
