import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2453), art #2465.
  // Enchantment: a mace under two halos, as the skill's.
  "smiters-boon": [
    "enchantment",
    (c) =>
      `<path d="M12 11V18" ${stroke(c, 1.6)}/>` +
      `<path d="M9.500 11L10.500 9H13.500L14.500 11Z" ${stroke(c, 1.3)}/>` +
      `<ellipse cx="12" cy="5.500" rx="2.500" ry="1" ${stroke(c, 1.2)}/>` +
      `<ellipse cx="12" cy="7.500" rx="3.500" ry="1.200" ${stroke(c, 1.2)}/>`,
  ],
};

export default rows;
