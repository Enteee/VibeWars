import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: a big heart with an arrow to a small one, half the blow passes on.
  "life-bond": [
    "enchantment",
    (c) =>
      `<path d="M15 21l-6-6a3.500 3.500 0 0 1 6-3.500 3.500 3.500 0 0 1 6 3.500z" ${stroke(c, 1.8)}/>` +
      `<path d="M13 7H6M8.500 4.500L6 7l2.500 2.500" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a hollow heart with a plus and a short blade, healed more, hits softer.
  "life-attunement": [
    "enchantment",
    (c) =>
      `<path d="M10 20l-6-6a3.500 3.500 0 0 1 6-3.500 3.500 3.500 0 0 1 6 3.500z" ${stroke(c, 1.8)}/>` +
      `<path d="M10 12.500v4M8 14.500h4M15 21l6-6" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a halo over a heart, healed more, hurt less.
  "aura-of-faith": [
    "enchantment",
    (c) =>
      `<ellipse cx="12" cy="5" rx="5" ry="2" ${stroke(c, 1.8)}/>` +
      `<path d="M12 21l-7-7a4 4 0 0 1 7-3.500 4 4 0 0 1 7 3.500z" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: an hourglass with chevrons, conditions and hexes run out fast.
  "peace-and-harmony": [
    "enchantment",
    (c) =>
      `<path d="M3 4h9M3 20h9M4.500 4c0 5 6 6 6 8s-6 3-6 8M10.500 4c0 5-6 6-6 8s6 3 6 8" ${stroke(c, 1.6)}/>` +
      `<path d="M15 7l4 5-4 5M19 7l3 5-3 5" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
