import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment party moves (#2070).
  // Enchantment: a star struck through, a critical hit that strips.
  "dark-apostasy": [
    "enchantment",
    (c) =>
      `<path d="M12 3l2.2 6.8H21l-5.5 4 2.1 6.7L12 16.4l-5.6 4.1 2.1-6.7-5.5-4h6.8z" ${stroke(c, 1.6)}/>` +
      `<path d="M4 20L20 4" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
