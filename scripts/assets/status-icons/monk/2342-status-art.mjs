import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Monk staples (#2286), art #2342.
  // Enchantment: a bolt and a cross, the Health healed returning as Energy.
  "essence-bond": [
    "enchantment",
    (c) =>
      `<path d="M10 4 6 12h4l-1.500 7" ${stroke(c, 1.8)}/>` +
      `<path d="M16 8v8M12 12h8" ${stroke(c, 1.7)}/>`,
  ],
  // Enchantment: a heart held in a shield, the blow turned to Health.
  "life-barrier": [
    "enchantment",
    (c) =>
      `<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 16.500 9 13.500a2 2 0 0 1 3-2.500 2 2 0 0 1 3 2.500z" ${stroke(c, 1.5)}/>`,
  ],
  // Enchantment: a shield with an arrow turning back off it.
  retribution: [
    "enchantment",
    (c) =>
      `<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M15.500 10H9M11.500 7.500 9 10l2.500 2.500" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a cross split by a jagged crack, the healing that harms.
  "scourge-healing": [
    "hex",
    (c) =>
      `<path d="M10.500 6h3v4.500H18v3h-4.500V18h-3v-4.500H6v-3h4.500z" ${stroke(c, 1.6)}/>` +
      `<path d="M7 17l4-4 2 2 4-5" ${stroke(c, 1.3)}/>`,
  ],
  // Enchantment: a seed sprouting two leaves.
  "healing-seed": [
    "enchantment",
    (c) =>
      `<ellipse cx="12" cy="17" rx="4" ry="3" ${stroke(c, 1.8)}/>` +
      `<path d="M12 14V7M12 9c-3 0-5-2-5-4 3 0 5 2 5 4zM12 9c3 0 5-2 5-4-3 0-5 2-5 4z" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a cross caught in a cupped arc.
  succor: [
    "enchantment",
    (c) =>
      `<path d="M10.500 4h3v3.500H17v3h-3.500V14h-3v-3.500H7v-3h3.500z" ${stroke(c, 1.6)}/>` +
      `<path d="M4 15c0 6 16 6 16 0" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a star over a heart, favour poured into a heal.
  "divine-boon": [
    "enchantment",
    (c) =>
      `<path d="M12 21l-6-6a3.500 3.500 0 0 1 6-4 3.500 3.500 0 0 1 6 4z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 2l1.200 3 3 .3-2.300 2 .7 3-2.600-1.600-2.600 1.600.7-3-2.300-2 3-.3z" ${stroke(c, 1.4)}/>`,
  ],
  // Enchantment: three soft lines of wind.
  "restful-breeze": [
    "enchantment",
    (c) => `<path d="M3 8h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 18h7" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
