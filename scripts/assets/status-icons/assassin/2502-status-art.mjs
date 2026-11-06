import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2502), art #2517.
  // Hex: a blade pointing down beside a star, weaker blows, their crits yours.
  "siphon-strength": [
    "hex",
    (c) =>
      `<path d="M9 5v10M7 13l2 4 2-4" ${stroke(c, 1.6)}/>` +
      `<path d="M16 8l1 2.500 2.500.3-1.900 1.700.6 2.500-2.200-1.300-2.200 1.300.6-2.500-1.900-1.700 2.500-.3z" fill="${c}"/>`,
  ],
  // Hex: a weight over slowing chevrons, a cracked shield while alone.
  "shadowy-burden": [
    "hex",
    (c) =>
      `<path d="M10.500 7h3l1.500 5h-6z" fill="${c}"/>` +
      `<path d="M8.500 14l1.500 1.500-1.500 1.500M11.500 14l1.500 1.500-1.500 1.500M14.500 14l1.500 1.500-1.500 1.500" ${stroke(c, 1.3)}/>`,
  ],
};

export default rows;
