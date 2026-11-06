import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2479), stand-ins until their art card.
  // Enchantment: a swirl ringed by breaks, interrupts on either end.
  "lyssas-haste": [
    "enchantment",
    (c) =>
      `<path d="M12 12m-3 0a3 3 0 1 0 6 0a5 5 0 1 0-10 0" ${stroke(c, 1.8)}/>` +
      `<path d="M3 5l2 2M21 5l-2 2M3 19l2-2M21 19l-2-2" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
