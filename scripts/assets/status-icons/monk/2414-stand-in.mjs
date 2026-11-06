import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2414), stand-ins until their art card.
  // Hex: a blade, and a plus for each blow it lands.
  "defenders-zeal": [
    "hex",
    (c) =>
      `<path d="M7 17l7-7M12.500 8.500l3 3" ${stroke(c, 1.8)}/>` +
      `<path d="M15.500 14.500v4M13.500 16.500h4" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
