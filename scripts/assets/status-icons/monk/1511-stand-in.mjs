import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Monk staples (#1511), stand-ins until their art card.
  // Enchantment: three small shields, a block for everyone in earshot.
  aegis: [
    "enchantment",
    (c) =>
      `<path d="M4 6h5v3c0 2-1.2 3-2.5 4C5.2 12 4 11 4 9zM15 6h5v3c0 2-1.2 3-2.5 4-1.3-1-2.5-2-2.5-4z" ${stroke(c, 1.6)}/>` +
      `<path d="M9.5 12h5v3c0 2-1.2 3-2.5 4-1.3-1-2.5-2-2.5-4z" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
