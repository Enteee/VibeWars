import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Corpus skills on existing mechanics (#2499), stand-ins until their art card.
  // Hex: a drop twice over, every sacrifice doubled.
  "scourge-sacrifice": [
    "hex",
    (c) =>
      `<path d="M9 8l-2.5 4a2.5 2.5 0 0 0 5 0z" ${stroke(c, 1.6)}/><path d="M15 12l-2.5 4a2.5 2.5 0 0 0 5 0z" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: two open hands, no blow between them.
  amity: [
    "hex",
    (c) =>
      `<path d="M7 16v-6M10 16v-7M14 16v-7M17 16v-6" ${stroke(c, 1.6)}/><path d="M6 18h12" ${stroke(c, 1.6)}/>`,
  ],
  // The next heal on an ally: a plus over a plus.
  "boon-signet": [
    "skill-effect",
    (c) => `<path d="M12 6v6M9 9h6M12 13v6M9 16h6" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a plus over a figure laid low.
  "supportive-spirit": [
    "enchantment",
    (c) => `<path d="M6 17h12" ${stroke(c, 2)}/><path d="M12 7v6M9 10h6" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
