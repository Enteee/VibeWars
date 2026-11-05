import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2367), a stand-in until its art card.
  // Enchantment: a blade under a small halo, melee blows a little harder.
  "strength-of-honor": [
    "enchantment",
    (c) =>
      `<ellipse cx="12" cy="5" rx="4" ry="1.5" ${stroke(c, 1.6)}/>` +
      `<path d="M12 8v10M9 15h6M12 18v2" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
