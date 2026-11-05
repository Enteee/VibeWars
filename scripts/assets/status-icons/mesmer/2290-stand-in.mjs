import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mind Wrack, Ignorance (#2290), stand-ins until their art card.
  // Hex: a bar of Energy draining to empty.
  "mind-wrack": [
    "hex",
    (c) => `<path d="M6 8h12v8H6z" ${stroke(c, 1.8)}/>` + `<path d="M12 4v16" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a signet ring struck through.
  ignorance: [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="6" ${stroke(c, 1.8)}/>` +
      `<path d="M6 18L18 6" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
