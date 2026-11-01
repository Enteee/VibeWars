import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Blood Magic orders and leeches (#2070).
  // Enchantment: a fang over a drop, the party's hits drink.
  "order-of-the-vampire": [
    "enchantment",
    (c) =>
      `<path d="M8 4l2 7 2-7" ${stroke(c, 2)}/>` +
      `<path d="M15 12c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6z" fill="${c}"/>`,
  ],
  // Enchantment: two strike bars and a third, the extra strike.
  "dark-fury": [
    "enchantment",
    (c) =>
      `<path d="M6 18V10M11 18V7" ${stroke(c, 2.2)}/>` +
      `<path d="M16 18V4M13 7h6" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a large drop with an up arrow, sacrifices grown.
  "awaken-the-blood": [
    "enchantment",
    (c) =>
      `<path d="M12 4c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" ${stroke(c, 2)}/>` +
      `<path d="M12 18v-7M9 14l3-3 3 3" ${stroke(c, 2)}/>`,
  ],
  // Hex: a spark leaking a drop, each spell bleeds Health.
  "soul-leech": [
    "hex",
    (c) =>
      `<path d="M6 4l2 4-2 4 4-2" ${stroke(c, 2)}/>` +
      `<path d="M15 11c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6z" fill="${c}"/>`,
  ],
};

export default rows;
