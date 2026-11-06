import { fitRows, stroke } from "../../icon-kit.mjs";

/** The held urn of ashes, small. @param {string} c */
const urn = (c) => `<path d="M5 9h7l-1 9H6z" fill="${c}"/><path d="M6 7h5" ${stroke(c, 1.6)}/>`;

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Unwritten corpus skills (#2500), stand-ins until their art card.
  // Item: the urn beside an ankh, the dead raised as it falls.
  "lively-was-naomei": [
    "item",
    (c) =>
      urn(c) +
      `<circle cx="17" cy="8" r="2.200" ${stroke(c, 1.5)}/><path d="M17 10.500V18M14 13h6" ${stroke(c, 1.6)}/>`,
  ],
  // Item: the urn beside two sound arcs, shouts and chants held longer.
  "vocal-was-sogolon": [
    "item",
    (c) => urn(c) + `<path d="M15 9a4 4 0 0 1 0 6M17.500 7a7 7 0 0 1 0 10" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a blade over an energy bolt, Energy for each weapon spell.
  "wielders-zeal": [
    "enchantment",
    (c) =>
      `<path d="M6 18L15 9M13 7l4 4" ${stroke(c, 1.7)}/>` +
      `<path d="M18 13l-2.500 3h2l-1.500 3" ${stroke(c, 1.4)}/>`,
  ],
  // Enchantment: an open eye in a ring, never blinded.
  "sight-beyond-sight": [
    "enchantment",
    (c) =>
      `<path d="M5 12q7-6 14 0q-7 6-14 0z" ${stroke(c, 1.6)}/><circle cx="12" cy="12" r="1.800" fill="${c}"/>`,
  ],
  // Enchantment: a blade over a condition drop with a tick.
  "wielders-remedy": [
    "enchantment",
    (c) =>
      `<path d="M6 18L15 9M13 7l4 4" ${stroke(c, 1.7)}/>` +
      `<path d="M15 14.500l1.500 1.500 2.500-3" ${stroke(c, 1.4)}/>`,
  ],
};

/** Drawn smaller to sit inside the item plate (#2404). */
const fits = {
  "lively-was-naomei": [0.9, 0.5],
  "vocal-was-sogolon": [0.94, 0],
};

export default fitRows(rows, fits);
