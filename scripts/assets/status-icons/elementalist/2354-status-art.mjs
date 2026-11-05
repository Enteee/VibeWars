import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: a cloud outline over two mist lines.
  "iron-mist": [
    "enchantment",
    (c) =>
      `<path d="M7 13a3.500 3.500 0 0 1 0-6.500 4.500 4.500 0 0 1 8.500-1A4 4 0 0 1 17 13z" ${stroke(c, 1.7)}/>` +
      `<path d="M5 17h12M8 20.500h11" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a wind curl with a small snowflake at its end, the next water hex longer.
  "chilling-winds": [
    "hex",
    (c) =>
      `<path d="M4 9h8a2.500 2.500 0 1 0-2.500-2.500M4 15h6" ${stroke(c, 1.7)}/>` +
      `<path d="M17 11v9M13.500 13l7 5M13.500 18l7-5" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
