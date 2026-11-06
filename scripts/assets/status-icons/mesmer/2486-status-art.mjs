import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2459, #2471, #2472), art #2486.
  // Hex: an hourglass with an arrow leaving it, as the skill's.
  "stolen-speed": [
    "hex",
    (c) =>
      `<path d="M7 8h5M7 16h5M7.500 8c0 3 3.500 3 3.500 4s-3.500 1-3.500 4M11.500 8c0 3-3.500 3-3.500 4s3.500 1 3.500 4" ${stroke(c, 1.5)}/>` +
      `<path d="M13.500 12h4.500M16 10.500l2 1.500-2 1.500" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a die with its pips.
  "calculated-risk": [
    "hex",
    (c) =>
      `<rect x="7" y="7" width="10" height="10" rx="2" ${stroke(c, 1.8)}/>` +
      `<path d="M10 10h.1M12 12h.1M14 14h.1" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a blade drawn in dashes over a solid hilt, as the skill's.
  "illusionary-weaponry": [
    "enchantment",
    (c) =>
      `<path d="M9 15L16 8l1.500-2.500L16 9.500 10 15Z" stroke-dasharray="2 1.500" ${stroke(c, 1.6)}/>` +
      `<path d="M7 13l4 4M6 18l3-3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
