import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2413, #2414), art #2431.
  // Enchantment: a dagger with a drop at its tip, its blows bleed, as the skill's.
  "sharpen-daggers": [
    "enchantment",
    (c) =>
      `<path d="M5 17L14 8M4 14l5 5M3.500 20l2-2" ${stroke(c, 1.8)}/>` +
      `<path d="M17 12c1.500 2.200 2.500 3.200 2.500 4.500a2.500 2.500 0 0 1-5 0c0-1.300 1-2.300 2.500-4.500z" fill="${c}"/>`,
  ],
};

export default rows;
