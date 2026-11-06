import { stroke } from "../../icon-kit.mjs";

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
      `<circle cx="9" cy="9" r="6.500" ${stroke(c, 1.6)} stroke-dasharray="3.500 2.500"/>` +
      `<path d="M9 5c1.500 2 2.500 3.500 2.500 5a2.500 2.500 0 0 1-5 0C6.500 8.500 7.500 7 9 5z" fill="${c}"/>` +
      `<path d="M20 11l-5 7h3.500l-1.500 5 6-7.500h-3.500z" fill="${c}"/>`,
  ],
};

export default rows;
