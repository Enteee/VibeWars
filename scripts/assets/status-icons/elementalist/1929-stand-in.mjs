import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment (#1929), a stand-in until its art card: four elements
  // held level, at one rank.
  "master-of-magic": [
    "enchantment",
    (c) => `<path d="M12 4l8 8-8 8-8-8z" ${stroke(c, 2)}/>` + `<path d="M8 12h8" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
