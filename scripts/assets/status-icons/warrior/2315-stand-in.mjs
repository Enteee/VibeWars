import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Warrior staples 5 (#2315), stand-ins until their art card.
  // Shout: a heart under a raised bar, three calls fanned over it.
  "to-the-limit": [
    "shout",
    (c) =>
      `<path d="M12 21l-5.5-5.5a3 3 0 0 1 5.5-3.4 3 3 0 0 1 5.5 3.4z" ${stroke(c, 1.9)}/>` +
      `<path d="M6 9h12" ${stroke(c, 2)}/>` +
      `<path d="M12 2.5v3M6.5 3.5l1.4 2M17.5 3.5l-1.4 2" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
