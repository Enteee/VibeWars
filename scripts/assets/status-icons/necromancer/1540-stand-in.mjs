import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Necromancer and Elementalist staples (#1540), stand-ins until their art card.
  // Enchantment: a drop over three regeneration arrows, energy bought with blood.
  "blood-is-power": [
    "enchantment",
    (c) =>
      `<path d="M12 3c2 3 3.5 4.5 3.5 6.5a3.5 3.5 0 0 1-7 0C8.5 7.5 10 6 12 3z" fill="${c}"/>` +
      `<path d="M6 19l2.5-2.5L11 19M10 19l2.5-2.5L15 19M14 19l2.5-2.5L19 19" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
