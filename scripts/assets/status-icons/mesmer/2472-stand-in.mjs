import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2472), stand-ins until their art card.
  // Enchantment: a blade drawn in dashes, a strike that is not there.
  "illusionary-weaponry": [
    "enchantment",
    (c) =>
      `<path d="M6 18L17 7l1-2-2 1L5 17" stroke-dasharray="2 1.5" ${stroke(c, 1.8)}/>` +
      `<path d="M4 15l5 5M3 21l2-2" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
