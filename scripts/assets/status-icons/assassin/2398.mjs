import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Fox's Promise, Seeping Wound, Shameful Fear (#2368), Flashing Blades (#2374), art #2398.
  // Enchantment: the fox head, slit eyes.
  "foxs-promise": [
    "enchantment",
    (c) =>
      `<path d="M4 3l5 5h6l5-5v9l-8 9-8-9z" ${stroke(c, 1.8)}/>` +
      `<path d="M7.500 12l2.500 1M16.500 12l-2.500 1" ${stroke(c, 1.5)}/>`,
  ],
  // Hex: a gash with a drop running from it.
  "seeping-wound": [
    "hex",
    (c) =>
      `<path d="M6 9c3-3 9-3 12 0-3 3-9 3-12 0z" ${stroke(c, 1.6)}/>` +
      `<path d="M12 13c1.500 2 2 3 2 4a2 2 0 0 1-4 0c0-1 .500-2 2-4z" fill="${c}"/>`,
  ],
  // Hex: running chevrons over spikes.
  "shameful-fear": [
    "hex",
    (c) =>
      `<path d="M8 6l4 4-4 4M13 6l4 4-4 4" ${stroke(c, 1.8)}/>` +
      `<path d="M9 19l1.500-3 1.500 3zM12.500 19l1.500-3 1.500 3z" fill="${c}"/>`,
  ],
  // Stance: two crossed blades with a flash at the cross.
  "flashing-blades": [
    "stance",
    (c) =>
      `<path d="M4 20L20 4M20 20L4 4" ${stroke(c, 2.2)}/>` +
      `<path d="M12 8l1.200 2.800L16 12l-2.800 1.200L12 16l-1.200-2.800L8 12l2.800-1.200z" fill="${c}" stroke="${c}" stroke-width="1"/>`,
  ],
};

export default rows;
