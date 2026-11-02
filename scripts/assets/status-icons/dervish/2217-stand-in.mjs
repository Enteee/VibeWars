import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Conviction (#2217), a stand-in until its art card.
  // Enchantment: a shield with a drop on it, armor and health while conditioned.
  conviction: [
    "enchantment",
    (c) =>
      `<path d="M12 3.5l7 2.5v5.5c0 4.5-3.5 7.5-7 9-3.5-1.5-7-4.5-7-9V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 8.5c1.6 2.2 2.4 3.4 2.4 4.6a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.4 2.4-4.6z" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
