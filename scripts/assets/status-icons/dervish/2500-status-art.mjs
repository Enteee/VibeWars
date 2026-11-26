import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Unwritten corpus skills (#2500), art #2516.
  // Enchantment: a shield half filled over a chevron pointing down: a
  // block while attacking, Weakness when it ends.
  "attackers-insight": [
    "enchantment",
    (c) =>
      `<path d="M12 4l6 2v5c0 3-2.500 5-6 6.500C8.500 16 6 14 6 11V6z" ${stroke(c, 1.6)}/>` +
      `<path d="M12 4l-6 2v5c0 3 2.500 5 6 6.500z" fill="${c}"/>` +
      `<path d="M9 18.500l3 2 3-2" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a starburst in a shield: the one block that knocks
  // down whoever is attacking.
  "shield-of-force": [
    "enchantment",
    (c) =>
      `<path d="M12 4l6 2v5c0 3-2.500 5-6 6.500C8.500 16 6 14 6 11V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 8.500l1.200 2.300 2.300 1.200-2.300 1.200L12 15.500l-1.200-2.300L8.500 12l2.300-1.200z" fill="${c}"/>`,
  ],
};

export default rows;
