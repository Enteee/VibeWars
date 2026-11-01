import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Blocks that pay (#1974), a stand-in until its art card.
  // Enchantment: a shield with a cross, a heal for everyone on a block.
  "shield-guardian": [
    "enchantment",
    (c) =>
      `<path d="M6 5h12v5.5c0 4-3 6.5-6 8.5-3-2-6-4.5-6-8.5z" ${stroke(c, 2)}/>` +
      `<path d="M12 8v7M8.5 11.5h7" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
