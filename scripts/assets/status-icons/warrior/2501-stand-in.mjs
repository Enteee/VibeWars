import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2501), stand-ins until their art card.
  // Stance: two chevrons, a third when a chant or shout is on you.
  "soldiers-speed": [
    "stance",
    (c) => `<path d="M5 7l5 5-5 5M11 7l5 5-5 5M17 9l3 3-3 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
