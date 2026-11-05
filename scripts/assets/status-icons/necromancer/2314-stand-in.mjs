import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2314), stand-ins until their art card.
  // Hex: two lungs with a drop below, the breath that makes them bleed.
  "ulcerous-lungs": [
    "hex",
    (c) =>
      `<path d="M11 4v6c0 3-2 6-5 6-2 0-2-2-2-4 0-4 3-8 7-8zM13 4v6c0 3 2 6 5 6 2 0 2-2 2-4 0-4-3-8-7-8z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 17c1 1.5 1.5 2.2 1.5 3a1.5 1.5 0 0 1-3 0c0-.8.5-1.5 1.5-3z" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: two drops joined by a line, the attackers' blood bound to it.
  "blood-bond": [
    "hex",
    (c) =>
      `<path d="M6 6c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6zM18 6c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6z" ${stroke(c, 1.8)}/>` +
      `<path d="M9 18h6" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a cloud of rot sinking down, the degeneration of the sick.
  "vile-miasma": [
    "hex",
    (c) =>
      `<path d="M6 13a3 3 0 0 1 1-6 4 4 0 0 1 8-1 3.5 3.5 0 0 1 3 7z" ${stroke(c, 1.8)}/>` +
      `<path d="M9 16v4M12 16v5M15 16v4" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a spark split in two, the Energy two foes lose to each spell.
  depravity: [
    "hex",
    (c) =>
      `<path d="M13 3 7 12h5l-1 9 6-9h-5z" ${stroke(c, 1.8)}/>` +
      `<path d="M4 18l3-3M20 18l-3-3" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a drop with a minus beside it, cheaper spells paid in blood.
  "cultists-fervor": [
    "enchantment",
    (c) =>
      `<path d="M10 5c2.5 3.5 4 5.5 4 8a4 4 0 0 1-8 0c0-2.5 1.5-4.5 4-8z" ${stroke(c, 1.8)}/>` +
      `<path d="M16 8h5" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
