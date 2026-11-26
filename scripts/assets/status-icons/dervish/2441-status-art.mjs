import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Counts and charges (#2373, #2438), art #2441.
  // Enchantment: claw fingers closing on a leg, as the skill's.
  "harriers-grasp": [
    "enchantment",
    (c) =>
      `<path d="M13 5H17V19H13Z" ${stroke(c, 1.5)}/>` +
      `<path d="M6 6C9 6 11 6 11 8.500M6 12H11M6 18C9 18 11 18 11 15.500" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: an hourglass with a plus on its sand, as the skill's.
  "pious-renewal": [
    "enchantment",
    (c) =>
      `<path d="M7.500 4H16.500V6C16.500 9 13.500 10.500 12.500 12C13.500 13.500 16.500 15 16.500 18V20H7.500V18C7.500 15 10.500 13.500 11.500 12C10.500 10.500 7.500 9 7.500 6Z" ${stroke(c, 1.5)}/>` +
      `<path d="M12 15V18.500M10.300 16.800H13.700" ${stroke(c, 1.3)}/>`,
  ],
};

export default rows;
