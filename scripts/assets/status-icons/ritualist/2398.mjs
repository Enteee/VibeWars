import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Spirit Channeling and Renewing Surge (#2368), art #2398.
  // Enchantment: a spirit post beside a bolt.
  "spirit-channeling": [
    "enchantment",
    (c) =>
      `<circle cx="7" cy="6" r="3" fill="${c}"/><path d="M5 10h4l.500 9H4.500z" fill="${c}"/>` +
      `<path d="M16 3l-5 8h4l-1.500 6 6-8h-4z" fill="${c}"/>` +
      `<path d="M12 22l4-3.500 4 3.500" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a drop in a dashed ring, a bolt coming back.
  "renewing-surge": [
    "hex",
    (c) =>
      `<circle cx="11" cy="10" r="4.800" ${stroke(c, 1.4)} stroke-dasharray="3 2.200"/>` +
      `<path d="M11 7.500c1 1.500 1.700 2.300 1.700 3.300a1.700 1.700 0 0 1-3.400 0c0-1 .700-1.800 1.700-3.300z" fill="${c}"/>` +
      `<path d="M17 11l-3.500 5H16l-1 4 4.500-5.500H17z" fill="${c}"/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2423). */
const fits = {
  "spirit-channeling": [1, -1],
};

export default fitRows(rows, fits);
