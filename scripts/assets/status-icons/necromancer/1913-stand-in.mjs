import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Skill-type and heal triggers (#1913), stand-ins until their art card.
  // Hex: a mouth with sound lines, a shout or chant that hurts.
  cacophony: [
    "hex",
    (c) =>
      `<path d="M5 9h4l5-4v14l-5-4H5z" fill="${c}"/>` +
      `<path d="M17 8l3-2M17 12h4M17 16l3 2" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
