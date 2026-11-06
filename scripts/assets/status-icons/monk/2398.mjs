import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Watchful Healing (#2374), art #2398.
  // Enchantment: an open eye with a plus for a pupil.
  "watchful-healing": [
    "enchantment",
    (c) =>
      `<path d="M2 12c4.500-7 15.500-7 20 0-4.500 7-15.500 7-20 0z" ${stroke(c, 1.8)}/>` +
      `<path d="M10.500 8h3v2.500H16v3h-2.500V16h-3v-2.500H8v-3h2.500z" fill="${c}"/>`,
  ],
};

export default rows;
