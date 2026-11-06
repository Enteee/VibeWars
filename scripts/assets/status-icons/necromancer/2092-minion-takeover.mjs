import { inset, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Taking foe minions (#2092), stand-ins until their art card.
  // Enchantment: a ring with an arrow drawn in, the foe's minions coming over.
  "veratas-aura": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="7" ${stroke(c, 2)}/>` +
      `<path d="M3 12h7M7 9l3 3-3 3" ${stroke(c, 2)}/>`,
  ],
  // Hex: a cross over a rising spine, less healing and a horror to come.
  "malign-intervention": [
    "hex",
    (c) =>
      inset(
        0.96,
        `<path d="M14 4v16M11 8h6M11 12h6M11 16h6" ${stroke(c, 1.8)}/>` +
          `<path d="M4 9l5 5M9 9l-5 5" ${stroke(c, 1.8)}/>`,
        0,
        0.5,
      ),
  ],
};

export default rows;
