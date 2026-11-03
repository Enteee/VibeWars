import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Elementalist status art (#2276).
  // Hex: two claws of earth closing over the ground.
  "grasping-earth": [
    "hex",
    (c) =>
      `<path d="M3 20h18" ${stroke(c, 2.2)}/>` +
      `<path d="M5.5 20c0-6 2-9 6.5-10M18.5 20c0-6-2-9-6.5-10" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: four small diamonds held level round a bar, one rank.
  "master-of-magic": [
    "enchantment",
    (c) =>
      `<path d="M12 3l3 3-3 3-3-3zM12 15l3 3-3 3-3-3zM3 12l3-3 3 3-3 3zM15 12l3-3 3 3-3 3z" fill="${c}"/>`,
  ],
  // Glyph: a ring with an arrow rising inside, boosted.
  "glyph-of-elemental-power": [
    "glyph",
    (c) =>
      `<circle cx="12" cy="12" r="8" ${stroke(c, 1.8)}/>` +
      `<path d="M12 17V8M8.5 11.5L12 8l3.5 3.5" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a flame on a ground line, hexed foes set alight.
  "elemental-flame": [
    "enchantment",
    (c) =>
      `<path d="M12 3c4 3.5 5.5 6.5 5.5 9.5a5.5 5.5 0 0 1-11 0c0-1.6.7-3 2-4.2 0 1.6.6 2.4 1.5 2.7C9 8.5 10 5.5 12 3z" fill="${c}"/>` +
      `<path d="M5 21h14" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
