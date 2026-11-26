import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Riders at the caster's ranks, ends on a non-hex skill (#2411), art #2426.
  // Enchantment: a blade point down between two aura arcs, as the skill's.
  "withering-aura": [
    "enchantment",
    (c) =>
      `<path d="M5.500 7Q3 12 5.500 17M18.500 7Q21 12 18.500 17" ${stroke(c, 1.6)}/>` +
      `<path d="M12 4.500v3.500M9.500 8h5" ${stroke(c, 1.8)}/>` +
      `<path d="M10.300 9.500h3.400L12 19.500z" fill="${c}"/>`,
  ],
  // Enchantment: a dashed ring holding a plus over rising bars, as the skill's.
  "hexers-vigor": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="7.500" ${stroke(c, 1.6)} stroke-dasharray="3.500 2.600"/>` +
      `<path d="M12 7.500v4.500M9.700 9.700h4.600" ${stroke(c, 1.7)}/>` +
      `<path d="M9 17v-1.500M12 17v-3M15 17v-4.500" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
