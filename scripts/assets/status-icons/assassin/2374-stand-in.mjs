import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Flashing Blades (#2374), a stand-in until its art card.
  // Stance: two crossed blades.
  "flashing-blades": ["stance", (c) => `<path d="M5 19 19 5M5 5l14 14" ${stroke(c, 2)}/>`],
};

export default rows;
