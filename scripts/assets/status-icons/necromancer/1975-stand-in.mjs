import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment party moves (#1975), stand-ins until their art cards.
  // Enchantment: a blade over a broken ring, each hit strips a foe.
  "order-of-apostasy": [
    "enchantment",
    (c) =>
      `<path d="M12 2v11" ${stroke(c, 2.4)}/>` +
      `<path d="M7 15a6 6 0 0 0 10 0M5 20h4M15 20h4" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: an eye over a minus, the next enchantment cheaper.
  "jaundiced-gaze": [
    "enchantment",
    (c) =>
      `<path d="M3 10c4-5 14-5 18 0c-4 5-14 5-18 0z" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="10" r="2" fill="${c}"/>` +
      `<path d="M8 19h8" ${stroke(c, 2.4)}/>`,
  ],
};

export default rows;
