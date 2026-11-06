import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2479), art #2487.
  // Enchantment: a wing of two feathers, as the skill's.
  "lyssas-haste": [
    "enchantment",
    (c) =>
      `<path d="M6.500 17c0-4 2-7 6-9 0 4.500-2.500 7.500-6 9zM11 17c0-4 2-7 6.500-9 0 4.500-3 7.500-6.500 9z" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
