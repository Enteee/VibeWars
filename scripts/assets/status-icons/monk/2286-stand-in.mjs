import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Monk staples (#2286), stand-ins until their art card.
  // Enchantment: a drop of Energy flowing back along a line.
  "essence-bond": [
    "enchantment",
    (c) =>
      `<path d="M12 4c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z" ${stroke(c, 1.8)}/>` +
      `<path d="M4 20h16M7 17l-3 3 3 3" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a shield halved by a line, half the blow kept off.
  "life-barrier": [
    "enchantment",
    (c) =>
      `<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 3v18" ${stroke(c, 1.4)}/>`,
  ],
  // Enchantment: an arrow striking a shield and turning back.
  retribution: [
    "enchantment",
    (c) =>
      `<path d="M15 4l5 2v5c0 4-2 7-5 9" ${stroke(c, 1.8)}/>` +
      `<path d="M3 9h9M9 6l3 3-3 3M12 15H3M6 12l-3 3 3 3" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a cross of healing broken by a jagged stroke.
  "scourge-healing": [
    "hex",
    (c) =>
      `<path d="M12 4v16M4 12h16" ${stroke(c, 2)}/>` +
      `<path d="M5 19l4-5 3 3 3-4 4 5" ${stroke(c, 1.4)}/>`,
  ],
  // Enchantment: a seed sprouting two leaves.
  "healing-seed": [
    "enchantment",
    (c) =>
      `<ellipse cx="12" cy="17" rx="4" ry="3" ${stroke(c, 1.8)}/>` +
      `<path d="M12 14V7M12 9c-3 0-5-2-5-4 3 0 5 2 5 4zM12 9c3 0 5-2 5-4-3 0-5 2-5 4z" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: two hands, one giving to the other.
  succor: [
    "enchantment",
    (c) =>
      `<path d="M3 14h6l3 3 3-3h6" ${stroke(c, 1.8)}/>` +
      `<path d="M12 4v8M9 9l3 3 3-3" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a star over a heart, favour poured into a heal.
  "divine-boon": [
    "enchantment",
    (c) =>
      `<path d="M12 21l-6-6a3.5 3.5 0 0 1 6-4 3.5 3.5 0 0 1 6 4z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 2l1.2 3 3 .3-2.3 2 .7 3-2.6-1.6-2.6 1.6.7-3-2.3-2 3-.3z" ${stroke(c, 1.4)}/>`,
  ],
  // Enchantment: three soft lines of wind.
  "restful-breeze": [
    "enchantment",
    (c) => `<path d="M3 8h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 18h7" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
