import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Unwritten corpus skills (#2500), stand-ins until their art card.
  // Skill effect: a shield with a flame beside it: the next attack skill
  // blocked, a melee attacker set alight.
  "burning-shield": [
    "skill-effect",
    (c) =>
      `<path d="M10 5l5 1.700v4.300c0 2.600-2 4.300-5 5.600-3-1.300-5-3-5-5.600V6.700z" ${stroke(c, 1.6)}/>` +
      `<path d="M17.500 11c1.500 2 2.300 3.300 2.300 4.700a2.300 2.300 0 0 1-4.600 0c0-1.400.800-2.700 2.300-4.700z" fill="${c}"/>`,
  ],
};

export default rows;
