import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2313), art #2364.
  // Enchantment: a slab of flesh with a germ in it, the disease held and passed on.
  "tainted-flesh": [
    "enchantment",
    (c) =>
      `<path d="M5 6l7-3 7 3v6c0 4-3 7-7 9-4-2-7-5-7-9z" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="11.500" r="2.200" ${stroke(c, 1.6)}/>` +
      `<path d="M12 7v2M12 14v2M7.500 11.500h2M14.500 11.500h2" ${stroke(c, 1.5)}/>`,
  ],
  // Enchantment: a drop inside a broken ring, the blood that strikes back.
  "dark-aura": [
    "enchantment",
    (c) =>
      `<path d="M12 5c2.500 3.500 3.500 5 3.500 7a3.500 3.500 0 0 1-7 0c0-2 1-3.500 3.500-7z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 2a10 10 0 0 1 10 10M12 22A10 10 0 0 1 2 12" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a big drop with an arrow leaving it, the Health sent away.
  "life-transfer": [
    "hex",
    (c) =>
      `<path d="M8 5c2.500 3.500 4 5.500 4 8a4 4 0 0 1-8 0c0-2.500 1.500-4.500 4-8z" ${stroke(c, 1.8)}/>` +
      `<path d="M13.500 13h6M17.500 10.500 20 13l-2.500 2.500" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: a small drop arriving at a big one, the Health gained.
  "life-transfer-regen": [
    "skill-effect",
    (c) =>
      `<path d="M16 5c2.500 3.500 4 5.500 4 8a4 4 0 0 1-8 0c0-2.500 1.500-4.500 4-8z" ${stroke(c, 1.8)}/>` +
      `<path d="M3.500 13h6M7.500 10.500 10 13l-2.500 2.500" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a horned orb, the hide that burns the foes beside it.
  "demonic-flesh": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="14" r="5.500" ${stroke(c, 1.8)}/>` +
      `<path d="M7 9 5 3.500l5 3M17 9l2-5.500-5 3" ${stroke(c, 1.7)}/>` +
      `<path d="M9.500 13.500l1.500 1M14.500 13.500l-1.500 1" ${stroke(c, 1.5)}/>`,
  ],
  // Hex: a bent leg cracked at the knee, legs that give way while moving.
  "weaken-knees": [
    "hex",
    (c) =>
      `<path d="M10.500 7v5l3 2.500v3" ${stroke(c, 2)}/>` +
      `<path d="M8.500 11.500 14.500 14" ${stroke(c, 1.5)}/>`,
  ],
};

export default rows;
