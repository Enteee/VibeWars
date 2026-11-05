import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Hex: a bolt over a figure lying flat, a strike that knocks down. All ink sits inside the plate's diamond.
  "lightning-surge": [
    "hex",
    (c) =>
      `<path d="M13.500 4L9.500 10h3L10.500 15" ${stroke(c, 1.8)}/>` +
      `<circle cx="8" cy="17.500" r="1.500" ${stroke(c, 1.4)}/>` +
      `<path d="M10.500 17.500H17" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: a short shield over an open ground arc, the ward on the floor.
  "ward-against-harm": [
    "skill-effect",
    (c) =>
      `<path d="M5.500 15.500Q12 21 18.500 15.500" ${stroke(c, 1.6)}/>` +
      `<path d="M12 3.500l4 1.500v3.500c0 2.500-1.500 3.500-4 5-2.500-1.500-4-2.500-4-5V5z" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
