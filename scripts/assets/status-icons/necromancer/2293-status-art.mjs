import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: a hollow heart with a bolt over it, sacrifice pays Energy.
  masochism: [
    "enchantment",
    (c) =>
      `<path d="M10 21l-6-6a3.500 3.500 0 0 1 6-3.500 3.500 3.500 0 0 1 6 3.500z" ${stroke(c, 1.8)}/>` +
      `<path d="M17 2l-3 5h4l-3 5" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
