import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Counts and charges (#2438), stand-ins until their art card.
  // Stance: a shield over three small signet squares, armor per signet.
  "mantra-of-signets": [
    "stance",
    (c) =>
      `<path d="M12 3l6 3v4c0 3-3 5-6 6-3-1-6-3-6-6V6z" ${stroke(c, 1.8)}/>` +
      `<rect x="6" y="17" width="3" height="3" ${stroke(c, 1.5)}/>` +
      `<rect x="10.5" y="17" width="3" height="3" ${stroke(c, 1.5)}/>` +
      `<rect x="15" y="17" width="3" height="3" ${stroke(c, 1.5)}/>`,
  ],
};

export default rows;
