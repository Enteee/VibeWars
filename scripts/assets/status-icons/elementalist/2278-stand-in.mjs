import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2278), stand-ins until their art card.
  // Hex: a bolt falling after a clock hand, a delayed strike.
  "lightning-surge": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="7" ${stroke(c, 1.8)}/>` +
      `<path d="M13 6l-3 6h4l-3 6" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: a ward square with a plus, regeneration and armor.
  "ward-against-harm": [
    "skill-effect",
    (c) =>
      `<path d="M5 5h14v14H5z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 8v8M8 12h8" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
