import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Condition movement (#2259), stand-ins until their art card.
  // Hex: a drop in the middle, three more thrown off round it.
  "fevered-dreams": [
    "hex",
    (c) =>
      `<path d="M12 8c-1.8 2.6-2.6 3.8-2.6 5a2.6 2.6 0 0 0 5.2 0c0-1.2-.8-2.4-2.6-5z" ${stroke(c, 1.8)}/>` +
      `<path d="M5 6l1.5 1.5M19 6l-1.5 1.5M12 20v-1.5" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
