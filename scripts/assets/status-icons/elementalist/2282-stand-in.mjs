import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Zealot's Fire, Glimmering Mark, Spoil Victor (#2282), stand-ins until their art card.
  // Hex: a mark with a spark in it, striking it and its neighbours.
  "glimmering-mark": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="7" ${stroke(c, 1.8)}/>` +
      `<path d="M13 6l-3 6h4l-3 6" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
