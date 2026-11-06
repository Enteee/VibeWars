import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Dropped leftovers (#2446), stand-ins until their art card.
  // Enchantment: a signet's square with an up arrow, signets at Fast Casting.
  "symbolic-celerity": [
    "enchantment",
    (c) =>
      `<rect x="5.5" y="9.5" width="8" height="8" rx="1.5" ${stroke(c, 1.8)}/>` +
      `<path d="M17 18V6M14 9l3-3 3 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
