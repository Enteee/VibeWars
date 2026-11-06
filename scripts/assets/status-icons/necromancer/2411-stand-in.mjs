import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Riders at the caster's ranks, ends on a non-hex skill (#2411), stand-ins until their art card.
  // Enchantment: a blade over a falling chevron, its hits weaken.
  "withering-aura": [
    "enchantment",
    (c) =>
      `<path d="M7 15 15 5M13 5h2v2" ${stroke(c, 2)}/>` +
      `<path d="M9 16l3 3 3-3" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a plus over three rising bars, regeneration while it lasts.
  "hexers-vigor": [
    "enchantment",
    (c) =>
      `<path d="M12 4v7M8.500 7.500h7" ${stroke(c, 2)}/>` +
      `<path d="M7 20v-3M12 20v-5M17 20v-7" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
