import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Pets 2 (#1865), stand-ins until their art card. Shout: a shield with a plus, the pet armoured.
  "otyughs-cry": [
    "shout",
    (c) =>
      `<path d="M7 5.5h10v5.5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" ${stroke(c, 2)}/>` +
      `<path d="M9.5 11h5M12 8.5v5" ${stroke(c, 2.2)}/>`,
  ],
};

export default rows;
