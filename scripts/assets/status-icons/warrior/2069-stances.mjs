import { stroke } from "../../icon-kit.mjs";

const SHIELD = (/** @type {string} */ c) =>
  `<path d="M6 4h12v7c0 4-3 7-6 9-3-2-6-5-6-9z" ${stroke(c, 2)}/>`;

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Tactics stances that pay on a block (#2069): the mark in the shield is the payment.
  // Stance: a bolt in the shield, Energy on a block.
  "wary-stance": ["stance", (c) => SHIELD(c) + `<path d="M13 7l-3 5h4l-3 5" ${stroke(c, 1.8)}/>`],
  // Stance: a plus in the shield, Health on a block.
  "soldiers-defense": [
    "stance",
    (c) => SHIELD(c) + `<path d="M12 8v7M8.5 11.5h7" ${stroke(c, 2)}/>`,
  ],
  // Stance: a chevron in the shield, adrenaline on a block.
  "defensive-stance": [
    "stance",
    (c) => SHIELD(c) + `<path d="M9 14l3-3.5 3 3.5M9 10l3-3.5 3 3.5" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: an hourglass in the shield, the stance lasts longer.
  "auspicious-parry": ["stance", (c) => SHIELD(c) + `<path d="M9 7h6l-6 9h6z" ${stroke(c, 1.7)}/>`],
};

export default rows;
