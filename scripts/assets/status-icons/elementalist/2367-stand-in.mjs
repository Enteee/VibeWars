import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2367), stand-ins until their art card.
  // Enchantment: a shield with a snowflake on its face, fire kept off.
  "frigid-armor": [
    "enchantment",
    (c) =>
      `<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 7.5v8M8.5 9.5l7 4M8.5 13.5l7-4" ${stroke(c, 1.4)}/>`,
  ],
  // Hex: two rings joined by a bar: held fast, weakened when it ends.
  "earthen-shackles": [
    "hex",
    (c) =>
      `<circle cx="7" cy="14" r="4" ${stroke(c, 1.8)}/>` +
      `<circle cx="17" cy="14" r="4" ${stroke(c, 1.8)}/>` +
      `<path d="M11 14h2M12 4v6" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: a prism splitting a blow: damage taken cut, energy after.
  "ether-prism": [
    "skill-effect",
    (c) =>
      `<path d="M12 4l7 14H5z" ${stroke(c, 1.8)}/>` +
      `<path d="M2 11h6M16 13l5-2M16 15l5 1" ${stroke(c, 1.4)}/>`,
  ],
};

export default rows;
