import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2313), stand-ins until their art card.
  // Enchantment: a germ behind a shield, the disease held off and passed on.
  "tainted-flesh": [
    "enchantment",
    (c) =>
      `<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="11" r="2.5" ${stroke(c, 1.8)}/>` +
      `<path d="M12 6.5v2M12 13.5v2M7.5 11h2M14.5 11h2" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a drop ringed by an aura, the sacrifice that strikes back.
  "dark-aura": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="8.5" ${stroke(c, 1.6)} stroke-dasharray="3 2"/>` +
      `<path d="M12 7c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6z" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a drop drawn out sideways, the Health transferred away.
  "life-transfer": [
    "hex",
    (c) =>
      `<path d="M8 5c2.5 3.5 4 5.5 4 8a4 4 0 0 1-8 0c0-2.5 1.5-4.5 4-8z" ${stroke(c, 1.8)}/>` +
      `<path d="M13 13h7M17.5 10.5 20 13l-2.5 2.5" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: a drop arriving from the side, the Health gained.
  "life-transfer-regen": [
    "skill-effect",
    (c) =>
      `<path d="M16 5c2.5 3.5 4 5.5 4 8a4 4 0 0 1-8 0c0-2.5 1.5-4.5 4-8z" ${stroke(c, 1.8)}/>` +
      `<path d="M4 13h7M8.5 10.5 11 13l-2.5 2.5" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a horned ring sparking outward, the flesh that burns
  // the foes beside it.
  "demonic-flesh": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="13" r="5" ${stroke(c, 1.8)}/>` +
      `<path d="M8 9 6 4M16 9l2-5M3 13h2M19 13h2M12 20v2" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a bent leg cut across, the knees that give way while moving.
  "weaken-knees": [
    "hex",
    (c) => `<path d="M9 3v8l5 4v6" ${stroke(c, 1.8)}/>` + `<path d="M6 9l10 6" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
