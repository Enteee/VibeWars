import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Zealot's Fire, Glimmering Mark, Spoil Victor (#2282), stand-ins until their art card.
  // Enchantment: a flame rising from a ring, burning round an ally.
  "zealots-fire": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="15" r="6" ${stroke(c, 1.6)}/>` +
      `<path d="M12 4c3 4-1 5 1 9-3-1-4-4-1-9z" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
