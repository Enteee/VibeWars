import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2501), stand-ins until their art card.
  // Enchantment: a blade with a plus beside it, stronger under a weapon spell.
  "spirits-strength": [
    "enchantment",
    (c) =>
      `<path d="M6 18l9-9M13 7l4 4M5 19l2-2" ${stroke(c, 1.8)}/>` +
      `<path d="M17 15v5M14.500 17.500h5" ${stroke(c, 1.6)}/>`,
  ],
  // Item: an urn with a minus over it, cheaper spells.
  "attuned-was-songkai": [
    "item",
    (c) =>
      `<path d="M9 10h6l1 7a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z" ${stroke(c, 1.6)}/>` +
      `<path d="M9 6h6" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a held bundle and a minus, cheaper while holding it.
  "renewing-memories": [
    "enchantment",
    (c) =>
      `<rect x="7" y="11" width="7" height="8" rx="1.500" ${stroke(c, 1.6)}/>` +
      `<path d="M15 7h5" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
