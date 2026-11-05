import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2367), stand-ins until their art card.
  // Hex: two rings chained to the ground, the foe barely moving.
  "earthen-shackles": [
    "hex",
    (c) =>
      `<circle cx="8" cy="10" r="3" ${stroke(c, 1.8)}/>` +
      `<circle cx="16" cy="10" r="3" ${stroke(c, 1.8)}/>` +
      `<path d="M11 10h2M4 19h16M8 13v6M16 13v6" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a prism turning blows aside, energy when it ends.
  "ether-prism": [
    "skill-effect",
    (c) =>
      `<path d="M12 4l7 13H5z" ${stroke(c, 1.8)}/>` +
      `<path d="M3 9l5 3M21 9l-5 3" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
