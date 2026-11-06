import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2367), stand-ins until their art card.
  // Hex: two rings chained to the ground, the foe barely moving.
  "earthen-shackles": [
    "hex",
    (c) =>
      `<circle cx="9" cy="10" r="2.5" ${stroke(c, 1.8)}/>` +
      `<circle cx="15" cy="10" r="2.5" ${stroke(c, 1.8)}/>` +
      `<path d="M11.5 10h1M7 17h10M9 12.5v4.5M15 12.5v4.5" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a prism turning blows aside, energy when it ends.
  "ether-prism": [
    "skill-effect",
    (c) =>
      `<path d="M12 7l5 10H7z" ${stroke(c, 1.8)}/>` +
      `<path d="M4 10l4 2M20 10l-4 2" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
