import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Zealot's Fire, Glimmering Mark, Spoil Victor (#2282), stand-ins until their art card.
  // Hex: a heart over a bar falling away, Health lost striking the weaker.
  "spoil-victor": [
    "hex",
    (c) =>
      `<path d="M12 15l-5-5a3 3 0 0 1 5-3 3 3 0 0 1 5 3z" ${stroke(c, 1.8)}/>` +
      `<path d="M6 19h12M12 15v4" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
