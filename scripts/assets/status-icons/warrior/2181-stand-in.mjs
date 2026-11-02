import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Warrior staples 4 (#2181), stand-ins until their art card.
  // Stance: three quick slashes under a bar, faster until a blow fails.
  "tiger-stance": [
    "stance",
    (c) =>
      `<path d="M6.5 18l3-8.5M10.5 18l3-8.5M14.5 18l3-8.5" ${stroke(c, 2.2)}/>` +
      `<path d="M6 6h12" ${stroke(c, 1.6)}/>`,
  ],
  // Stance: two quick slashes beside rising bars, faster and more adrenaline.
  "berserker-stance": [
    "stance",
    (c) =>
      `<path d="M5 18l3-8.5M9 18l3-8.5" ${stroke(c, 2.2)}/>` +
      `<path d="M14.5 18v-3M17 18v-6M19.5 18v-9" ${stroke(c, 2)}/>`,
  ],
  // Stance: chevrons running into a ground bar, a moving foe knocked down.
  "bulls-charge": [
    "stance",
    (c) =>
      `<path d="M5 7l4.5 5L5 17M10.5 7l4.5 5-4.5 5" ${stroke(c, 2.4)}/>` +
      `<path d="M18 6v12" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
