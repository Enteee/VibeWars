import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Caster staples 2 (#1872), stand-ins until their art card.
  // Enchantment: a heart with a plus over it, more maximum Health.
  "vital-blessing": [
    "enchantment",
    (c) =>
      `<path d="M12 20l-7-7a4 4 0 0 1 7-5 4 4 0 0 1 7 5z" fill="${c}"/>` +
      `<path d="M12 2v5M9.5 4.5h5" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
