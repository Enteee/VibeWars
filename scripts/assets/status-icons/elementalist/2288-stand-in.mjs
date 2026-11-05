import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2288), stand-ins until their art card.
  // Enchantment: two wind streaks and a forward chevron, moving faster.
  gust: [
    "enchantment",
    (c) =>
      `<path d="M4 9h10M4 15h8" ${stroke(c, 1.8)}/>` +
      `<path d="M15 7l5 5-5 5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a diamond mirror with a crack, slowed by ice.
  "mirror-of-ice": [
    "hex",
    (c) =>
      `<path d="M12 4l7 8-7 8-7-8z" ${stroke(c, 1.8)}/>` +
      `<path d="M10 9l3 3-2 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
