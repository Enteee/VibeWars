import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Dervish staples 2 (#1604), stand-ins until their art card.
  // Stance: three fast slashes, it attacks 25% faster.
  "pious-fury": ["stance", (c) => `<path d="M5 18L13 6M9 19L17 7M13 20L20 9" ${stroke(c, 2)}/>`],
};

export default rows;
