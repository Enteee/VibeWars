import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Caster staples (#1870), stand-ins until their art card.
  // Enchantment: a figure planted on a wide base, cannot be knocked down.
  "aura-of-stability": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="6" r="2.2" fill="${c}"/>` +
      `<path d="M12 9v7M5 20h14M8 20l4-4 4 4" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
