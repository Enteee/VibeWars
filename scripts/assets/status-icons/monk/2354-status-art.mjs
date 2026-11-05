import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: an upright blade with a loop for a pommel, an ankh sword.
  vengeance: [
    "enchantment",
    (c) =>
      `<path d="M12 2.500v13M8 12h8" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="19" r="2.500" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
