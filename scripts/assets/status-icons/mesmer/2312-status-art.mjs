import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Hex: a bolt with a falling arrow, Energy lost to your skills.
  "mind-wrack": [
    "hex",
    (c) =>
      `<path d="M13 3l-4 7h5l-4 7" ${stroke(c, 1.8)}/>` +
      `<path d="M17 14v7M14.500 18.500L17 21l2.500-2.500" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a signet ring struck through.
  ignorance: [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="5" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="12" r="1.500" fill="${c}"/>` +
      `<path d="M4 20L20 4" ${stroke(c, 2)}/>`,
  ],
  // Hex: a ring with clock hands, enchantments cast slowly.
  "enchanters-conundrum": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="8" ${stroke(c, 1.8)}/>` +
      `<path d="M12 7v5l3 2" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
