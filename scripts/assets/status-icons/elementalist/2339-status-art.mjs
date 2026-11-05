import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: a shield with three icicles hanging inside it.
  "armor-of-frost": [
    "enchantment",
    (c) =>
      `<path d="M12 3l7.500 3v5.500c0 4-3 7-7.500 8.500c-4.500-1.500-7.500-4.500-7.500-8.500V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M8.500 8v4l1-1.500V8M14.500 8v4l-1-1.500V8M12 8v6" ${stroke(c, 1.5)}/>`,
  ],
  // Hex: two linked rings with a spark between them, about to burst.
  "incendiary-bonds": [
    "hex",
    (c) =>
      `<circle cx="8.500" cy="13" r="4.500" ${stroke(c, 1.8)}/>` +
      `<circle cx="15.500" cy="13" r="4.500" ${stroke(c, 1.8)}/>` +
      `<path d="M12 2.500v4M9 4l1.500 2.500M15 4l-1.500 2.500" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a ring with a crack through it and a flake falling.
  rust: [
    "hex",
    (c) =>
      `<circle cx="12" cy="11" r="6.500" ${stroke(c, 1.8)}/>` +
      `<path d="M12 4.500l-2 4 3 2-2 4" ${stroke(c, 1.5)}/>` +
      `<path d="M17 20h2" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
