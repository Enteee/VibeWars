import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Narrower filters (#2432), stand-ins until their art card.
  // Enchantment: two crossed blades over a bolt, a dual hit gives Energy.
  "way-of-the-lotus": [
    "enchantment",
    (c) =>
      `<path d="M5 5l9 9M19 5l-9 9" ${stroke(c, 1.8)}/>` +
      `<path d="M13 14l-2 3h3l-2 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
