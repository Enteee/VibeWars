import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Watchful Healing (#2374), a stand-in until its art card.
  // Enchantment: an open eye over a cross.
  "watchful-healing": [
    "enchantment",
    (c) =>
      `<path d="M3 9c5-6 13-6 18 0-5 6-13 6-18 0z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 14v7M9 17.5h6" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
