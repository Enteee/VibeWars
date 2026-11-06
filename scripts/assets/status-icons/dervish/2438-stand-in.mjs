import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Counts and charges (#2438), stand-ins until their art card.
  // Enchantment: a hand closing on a leg, the Cripple it lands.
  "harriers-grasp": [
    "enchantment",
    (c) =>
      `<path d="M6 6c3 0 5 2 5 5v8" ${stroke(c, 1.8)}/>` +
      `<path d="M14 8h4M14 12h4M14 16h4" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a circling arrow round a plus, recharged and healed as it ends.
  "pious-renewal": [
    "enchantment",
    (c) =>
      `<path d="M18 8a7 7 0 1 0 1 6" ${stroke(c, 1.8)}/>` +
      `<path d="M18 4v4h-4" ${stroke(c, 1.8)}/>` +
      `<path d="M12 9v6M9 12h6" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
