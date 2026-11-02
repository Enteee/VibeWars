import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment party moves (#2070).
  // Enchantment: a minus over a spark, enchantments on the bearer cheaper.
  "air-of-enchantment": [
    "enchantment",
    (c) =>
      `<path d="M6 6h12" ${stroke(c, 2.4)}/>` +
      `<path d="M12 10l1.8 4.2L18 16l-4.2 1.8L12 22l-1.8-4.2L6 16l4.2-1.8z" fill="${c}"/>`,
  ],
};

export default rows;
