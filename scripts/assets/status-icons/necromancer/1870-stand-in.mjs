import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Caster staples (#1870), stand-ins until their art card.
  // Enchantment: a drop over a rising arrow, regeneration that pays out.
  "blood-renewal": [
    "enchantment",
    (c) =>
      `<path d="M9 4C11 7 13 9 13 11.5a4 4 0 0 1-8 0C5 9 7 7 9 4z" fill="${c}"/>` +
      `<path d="M17 20V10M14 13l3-3 3 3" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
