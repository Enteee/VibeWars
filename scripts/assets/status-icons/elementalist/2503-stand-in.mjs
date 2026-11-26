import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2503), stand-ins until their art card.
  // Enchantment: a rock with two arrows turning into it.
  "stone-striker": [
    "enchantment",
    (c) =>
      `<path d="M9 15l3-5 3 5z" fill="${c}"/>` + `<path d="M7 9l2 2M17 9l-2 2" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a heart over an energy bolt.
  "energy-boon": [
    "enchantment",
    (c) =>
      `<path d="M12 12c-2-2-4-1-4 1s4 4 4 4 4-2 4-4-2-3-4-1z" fill="${c}"/>` +
      `<path d="M13 6l-2 3h2l-1 2" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
