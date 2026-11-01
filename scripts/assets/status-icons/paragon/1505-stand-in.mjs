import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Paragon chants 3 (#1505), stand-ins until the asset-designer's.
  // Chant: a bar held level, your next skill cannot be interrupted.
  "song-of-concentration": ["chant", (c) => `<path d="M5 12h14M5 8v8M19 8v8" ${stroke(c, 2.2)}/>`],
};

export default rows;
