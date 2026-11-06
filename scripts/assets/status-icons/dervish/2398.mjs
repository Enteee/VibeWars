import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mystic Corruption (#2368), art #2398.
  // Enchantment: a spore under a circle open at the top, a plus rising from the gap.
  "mystic-corruption": [
    "enchantment",
    (c) =>
      `<path d="M7.100 6.500A8.500 8.500 0 1 0 16.900 6.500" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="14" r="3.500" fill="${c}"/>` +
      `<path d="M12 2v5M9.500 4.500h5" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
