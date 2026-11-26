import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2501), art #2517.
  // Enchantment: a holy star under a broken halo.
  "vow-of-piety": [
    "enchantment",
    (c) =>
      `<path d="M12 8l1.800 3.200L17 12l-3.200.8L12 16l-1.800-3.200L7 12l3.200-.8z" fill="${c}"/>` +
      `<path d="M6.500 8a7 7 0 0 1 11 0" ${stroke(c, 1.5)}/>`,
  ],
  // Skill effect: a ring with three ticks, each an instant enchantment.
  "signet-of-mystic-speed": [
    "skill-effect",
    (c) =>
      `<circle cx="12" cy="13.500" r="4" ${stroke(c, 1.6)}/>` +
      `<path d="M8.500 7l1 1.500M12 6v2M15.500 7l-1 1.500" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
