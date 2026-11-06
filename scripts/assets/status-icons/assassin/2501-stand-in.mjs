import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2501), stand-ins until their art card.
  // Enchantment: a half circle with speed lines, half-ranged spells hastened.
  "deadly-haste": [
    "enchantment",
    (c) =>
      `<path d="M12 6a6 6 0 0 1 0 12z" fill="${c}"/>` +
      `<path d="M4 9h5M3 12h6M4 15h5" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
