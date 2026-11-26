import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: an hourglass with a bolt, Energy when the sand runs out.
  "mantra-of-recall": [
    "enchantment",
    (c) =>
      `<path d="M4 3h10M4 21h10M5.500 3c0 6 7 7 7 9s-7 3-7 9M12.500 3c0 6-7 7-7 9s7 3 7 9" ${stroke(c, 1.6)}/>` +
      `<path d="M19 8l-3 5h4l-3 5" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
