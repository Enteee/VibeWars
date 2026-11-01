import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mantras (#1964), stand-ins until their art card.
  // Stance: a ring unbroken, the next interrupt shrugged off.
  "mantra-of-concentration": ["stance", (c) => `<circle cx="12" cy="13" r="5" ${stroke(c, 2.2)}/>`],
};

export default rows;
