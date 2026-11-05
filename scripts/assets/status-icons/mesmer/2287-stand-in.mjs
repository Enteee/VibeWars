import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2287), stand-ins until their art card.
  // Hex: a drop draining downward, the foe's Energy.
  "ether-lord": [
    "hex",
    (c) =>
      `<path d="M12 4c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 11v6M9.5 14.5 12 17l2.5-2.5" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: the same drop, rising, the caster's.
  "ether-lord-regeneration": [
    "skill-effect",
    (c) =>
      `<path d="M12 4c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 17v-6M9.5 13.5 12 11l2.5 2.5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a blow glancing off a cross, the miss.
  "spirit-of-failure": [
    "hex",
    (c) =>
      `<path d="M5 5l14 14M19 5L5 19" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="12" r="3" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: two linked rings, the shackles.
  "spirit-shackles": [
    "hex",
    (c) =>
      `<circle cx="9" cy="12" r="4" ${stroke(c, 1.8)}/>` +
      `<circle cx="15" cy="12" r="4" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a flat wave, adrenaline that does not rise.
  "soothing-images": [
    "hex",
    (c) => `<path d="M4 9c3-3 5 3 8 0s5 3 8 0M4 15h16" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a spark over a ring, the spell's overcast.
  "arcane-languor": [
    "hex",
    (c) =>
      `<circle cx="12" cy="14" r="5" ${stroke(c, 1.8)}/>` +
      `<path d="M12 3v4M9 5l3 2 3-2" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a jagged line, the pain, under a plus, the heal it ends with.
  "illusion-of-pain": [
    "hex",
    (c) =>
      `<path d="M3 16l4-4 3 3 4-6 3 4 4-3" ${stroke(c, 1.8)}/>` +
      `<path d="M12 3v4M10 5h4" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a dashed drop, the phantom Energy.
  "ether-phantom": [
    "hex",
    (c) =>
      `<path d="M12 4c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z" ${stroke(c, 1.8)} stroke-dasharray="2 2"/>`,
  ],
};

export default rows;
