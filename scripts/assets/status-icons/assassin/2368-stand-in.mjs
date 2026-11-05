import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2368), stand-ins until their art card.
  // Enchantment: a dagger through a ring, unblockable.
  "foxs-promise": [
    "enchantment",
    (c) =>
      `<path d="M5 19L17 7M17 7l2-3M14 6l4 4" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="12" r="8" ${stroke(c, 1.2)}/>`,
  ],
  // Hex: a dripping wound over slow chevrons.
  "seeping-wound": [
    "hex",
    (c) =>
      `<path d="M6 5l12 6" ${stroke(c, 2)}/>` +
      `<path d="M12 12c2 3 2.5 4 2.5 5a2.5 2.5 0 0 1-5 0c0-1 .5-2 2.5-5z" fill="${c}"/>`,
  ],
  // Hex: a running figure trailing pain marks.
  "shameful-fear": [
    "hex",
    (c) =>
      `<circle cx="14" cy="5" r="2" fill="${c}"/>` +
      `<path d="M13 8l-2 6 4 2v5M11 14l-4 5M13 9l4 2" ${stroke(c, 1.8)}/>` +
      `<path d="M3 8h4M2 12h4" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
