import { fitRows, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Corpus skills on existing mechanics (#2499), art #2516.
  // Hex: a drop twice over, every sacrifice doubled.
  "scourge-sacrifice": [
    "hex",
    (c) =>
      `<path d="M9 8l-2.5 4a2.5 2.5 0 0 0 5 0z" ${stroke(c, 1.6)}/><path d="M15 12l-2.5 4a2.5 2.5 0 0 0 5 0z" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a sword snapped in two, no blow struck.
  amity: [
    "hex",
    (c) =>
      `<path d="M5.500 18.500L11 13M13 11l5.500-5.500M7 13.500l3.500 3.500" ${stroke(c, 1.8)}/>`,
  ],
  // The next heal on an ally: a signet ring beside two pluses.
  "boon-signet": [
    "skill-effect",
    (c) =>
      `<circle cx="8.500" cy="15.500" r="3.500" ${stroke(c, 1.7)}/><path d="M16.500 5v8M12.500 9h8M17.500 15v4M15.500 17h4" ${stroke(c, 1.7)}/>`,
  ],
  // Enchantment: a spirit post beside a heart.
  "supportive-spirit": [
    "enchantment",
    (c) =>
      `<circle cx="8" cy="8.500" r="2.200" fill="${c}"/><path d="M8 12v6" ${stroke(c, 2.2)}/>` +
      `<path d="M16.500 18c-4-3-4-6-2-6.800 1.200-.4 2 .4 2 1.300 0-.9.800-1.700 2-1.300 2 .8 2 3.800-2 6.800z" fill="${c}"/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2404). */
const fits = { amity: [0.8, 0] };

export default fitRows(rows, fits);
