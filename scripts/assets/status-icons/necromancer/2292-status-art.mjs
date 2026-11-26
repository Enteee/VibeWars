import { inset, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Hex: a heart with a bar falling from it, the creature with less Health pays.
  "spoil-victor": [
    "hex",
    (c) =>
      inset(
        0.88,
        `<path d="M12 14l-6-6a3.4 3.4 0 0 1 6-3 3.4 3.4 0 0 1 6 3z" ${stroke(c, 1.8)}/>` +
          `<path d="M12 16v6M9 19.5l3 2.5 3-2.5" ${stroke(c, 1.8)}/>`,
        0,
        1,
      ),
  ],
};

export default rows;
