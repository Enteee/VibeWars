import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: a scythe blade with a drop falling from it, blows steal Health.
  "grenths-aura": [
    "enchantment",
    (c) =>
      `<path d="M16 21L8 4M8 4c5-2 10 1 12 6-4-2.500-8-3.500-12-6z" ${stroke(c, 1.8)}/>` +
      `<path d="M6 14c-1.500 2-2 3-2 4a2 2 0 0 0 4 0c0-1-.5-2-2-4z" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
