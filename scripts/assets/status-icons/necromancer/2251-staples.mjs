import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Necromancer staples (#2230), art #2251.
  // Enchantment: a drop over two rising arrows, Health regeneration from a theft.
  "vampiric-spirit": [
    "enchantment",
    (c) =>
      `<path d="M12 3c2 3 3.5 4.5 3.5 6.5a3.5 3.5 0 0 1-7 0C8.5 7.5 10 6 12 3z" fill="${c}"/>` +
      `<path d="M7 20l2.5-2.5L12 20M12 20l2.5-2.5L17 20" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
