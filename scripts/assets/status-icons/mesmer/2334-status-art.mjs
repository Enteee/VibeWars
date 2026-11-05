import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Hex: a drop draining downward, the foe's Energy.
  "ether-lord": [
    "hex",
    (c) =>
      `<path d="M12 4c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 11v6M9.500 14.500 12 17l2.500-2.500" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: the same drop, rising, the caster's.
  "ether-lord-regeneration": [
    "skill-effect",
    (c) =>
      `<path d="M12 4c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 17v-6M9.500 13.500 12 11l2.500 2.500" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a cross, the attack that fails.
  "spirit-of-failure": ["hex", (c) => `<path d="M7 7l10 10M17 7L7 17" ${stroke(c, 2)}/>`],
  // Hex: two linked rings, the shackles.
  "spirit-shackles": [
    "hex",
    (c) =>
      `<circle cx="8.500" cy="12" r="3.500" ${stroke(c, 1.8)}/>` +
      `<circle cx="15.500" cy="12" r="3.500" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a crescent moon, adrenaline lulled.
  "soothing-images": [
    "hex",
    (c) => `<path d="M14 5a7 7 0 1 0 5 9a5.500 5.500 0 0 1-5-9z" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: two rings, the spell that costs more.
  "arcane-languor": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="3" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="12" r="6.500" ${stroke(c, 1.5)}/>`,
  ],
  // Hex: a jagged line over a plus, pain ending in a heal.
  "illusion-of-pain": [
    "hex",
    (c) =>
      `<path d="M5 10l3-3 2 3 3-5 2 4 2-2" ${stroke(c, 1.8)}/>` +
      `<path d="M12 13v6M9 16h6" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a dashed drop, the phantom Energy.
  "ether-phantom": [
    "hex",
    (c) =>
      `<path d="M12 4c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z" ${stroke(c, 1.8)} stroke-dasharray="2 2"/>`,
  ],
};

export default rows;
