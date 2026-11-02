import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mesmer interrupts (#2165), stand-in until its art card.
  // Hex: a web of three threads, crossed by a break, the second interrupt.
  "web-of-disruption": [
    "hex",
    (c) =>
      `<path d="M12 3v18M4 7l16 10M20 7L4 17" ${stroke(c, 1.6)}/>` +
      `<path d="M7 12a5 5 0 0 1 10 0" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
