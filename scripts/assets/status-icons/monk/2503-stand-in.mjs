import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2503), stand-ins until their art card.
  // Enchantment: a pendulum swung back.
  "balthazars-pendulum": [
    "enchantment",
    (c) =>
      `<path d="M12 7l-3 7" ${stroke(c, 1.6)}/>` + `<circle cx="9" cy="15" r="2" fill="${c}"/>`,
  ],
};

export default rows;
