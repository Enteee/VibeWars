import { C, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // A plus over a ripple: the spring heals.
  refreshed: [
    "environment",
    (c) =>
      `<path d="M12 5v7M8.5 8.5h7" ${stroke(c, 2.5)}/>` +
      `<path d="M5 17q2-2 3.5 0t3.5 0 3.5 0 3.5 0" ${stroke(c, 2)}/>`,
  ],
  // Two chevrons: the grove's quick feet.
  fleet: [
    "environment",
    (c) => `<path d="M7 7.5l4.5 4.5-4.5 4.5M12.5 7.5l4.5 4.5-4.5 4.5" ${stroke(c, 2.5)}/>`,
  ],
  // A drop crossed out: water that costs you.
  tainted: [
    "environment",
    (c) =>
      `<path d="M12 5.5c-3 4-4.5 6.3-4.5 8.5a4.5 4.5 0 0 0 9 0c0-2.2-1.5-4.5-4.5-8.5z" fill="${c}"/>` +
      `<path d="M10.3 12.6l3.4 3.4M13.7 12.6l-3.4 3.4" ${stroke(C.environment, 1.5)}/>`,
  ],
  // An obelisk drawing in from both sides: the spire's pull on Energy.
  drained: [
    "environment",
    (c) =>
      `<path d="M10.2 20h3.6l-0.6-10.5L12 6.5l-1.2 3z" fill="${c}"/>` +
      `<path d="M5 9.5q3 1 4 4.5M19 9.5q-3 1-4 4.5" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
