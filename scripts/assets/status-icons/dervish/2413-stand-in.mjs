import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2413), stand-ins until their art card.
  // Enchantment: a closed eye over a rising spark, Energy as enchantments end.
  meditation: [
    "enchantment",
    (c) =>
      `<path d="M5 9c2 3 12 3 14 0" ${stroke(c, 1.8)}/>` +
      `<path d="M12 20v-6M9 16l3-3 3 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
