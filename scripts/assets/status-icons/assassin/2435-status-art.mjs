import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2367, #2428, #2432), art #2435.
  // Enchantment: a flask with a plus cut in it, as the skill's.
  "assassins-remedy": [
    "enchantment",
    (c) =>
      `<path d="M10 4.500h4v4l4 7.500a1.500 1.500 0 0 1-1.300 2h-9.400a1.500 1.500 0 0 1-1.300-2l4-7.500z" ${stroke(c, 1.6)}/>` +
      `<path d="M12 12.500v4M10 14.500h4" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: an open lotus over a bolt, as the skill's.
  "way-of-the-lotus": [
    "enchantment",
    (c) =>
      `<path d="M12 4c3.200 3.200 3.200 7 0 11-3.200-4-3.200-7.800 0-11zM11.300 15c-4-.5-6-3-6-6 3.800.5 5.800 2.800 6 6zM12.700 15c4-.5 6-3 6-6-3.800.5-5.800 2.800-6 6z" ${stroke(c, 1.4)}/>` +
      `<path d="M5.500 18.500h13M12.800 6.500L11 10h2l-1.300 3" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
