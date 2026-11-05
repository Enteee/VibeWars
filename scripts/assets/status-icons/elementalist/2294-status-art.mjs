import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Hex: a bolt over a figure lying flat, a strike that knocks down.
  "lightning-surge": [
    "hex",
    (c) =>
      `<path d="M14 3l-6 8h4l-3 6" ${stroke(c, 1.8)}/>` +
      `<circle cx="5" cy="20" r="1.8" ${stroke(c, 1.5)}/>` +
      `<path d="M8 20h13" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: a shield in a ground ring, the ward on the floor.
  "ward-against-harm": [
    "skill-effect",
    (c) =>
      `<ellipse cx="12" cy="18" rx="9" ry="3.5" ${stroke(c, 1.6)}/>` +
      `<path d="M12 3l5 2v5c0 3-2 4.500-5 6-3-1.500-5-3-5-6V5z" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
