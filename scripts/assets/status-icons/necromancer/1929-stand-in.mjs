import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Hex (#1929), a stand-in until its art card: a zero struck through,
  // every attribute gone.
  "wail-of-doom": [
    "hex",
    (c) =>
      `<ellipse cx="12" cy="12" rx="5" ry="7" ${stroke(c, 2.2)}/>` +
      `<path d="M6 19L18 5" ${stroke(c, 2)}/>`,
  ],
  // Hex (#1929), a stand-in until its art card: one bar fallen to the
  // floor, the primary attribute gone.
  atrophy: [
    "hex",
    (c) =>
      `<path d="M5 19h14" ${stroke(c, 2.2)}/>` +
      `<path d="M8 16V8M12 16V5M16 16v-1" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
