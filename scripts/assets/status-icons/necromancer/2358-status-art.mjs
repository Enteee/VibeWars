import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Hex: two lungs over a drop, the cough that makes them bleed.
  "ulcerous-lungs": [
    "hex",
    (c) =>
      `<path d="M11 6v5c0 3-2 5-4.500 5-1.500 0-1.500-2-1.500-3.500C5 9 8 6 11 6zM13 6v5c0 3 2 5 4.500 5 1.500 0 1.500-2 1.500-3.500C19 9 16 6 13 6z" ${stroke(c, 1.6)}/>` +
      `<path d="M12 16.500v2" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: two linked rings, the attackers' blood bound to it.
  "blood-bond": [
    "hex",
    (c) =>
      `<circle cx="9" cy="12" r="3.500" ${stroke(c, 1.6)}/>` +
      `<circle cx="15" cy="12" r="3.500" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a spiral of rot, the degeneration of the sick.
  "vile-miasma": [
    "hex",
    (c) =>
      `<path d="M12 12a1.500 1.500 0 1 1 1.500-1.500 3 3 0 1 1-3-3 4.500 4.500 0 0 1 4.500 4.500" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a bolt struck through, the Energy foes lose.
  depravity: [
    "hex",
    (c) =>
      `<path d="M13 5L9 12h4l-1.500 6" ${stroke(c, 1.7)}/>` +
      `<path d="M8 8l8 8" ${stroke(c, 1.5)}/>`,
  ],
  // Enchantment: a drop with shrinking bars at its side, cheaper spells paid in blood.
  "cultists-fervor": [
    "enchantment",
    (c) =>
      `<path d="M14 5c2.500 3.500 3.500 5 3.500 7a3.500 3.500 0 0 1-7 0c0-2 1-3.500 3.500-7z" ${stroke(c, 1.7)}/>` +
      `<path d="M6.500 8h3M6.500 12h2M6.500 16h1" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
