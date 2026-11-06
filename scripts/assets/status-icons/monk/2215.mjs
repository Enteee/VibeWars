import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: a half-filled shield under three dots, a block for the party (#1511).
  aegis: [
    "enchantment",
    (c) =>
      `<path d="M12 6l7 2.5v4c0 3.5-3 5.5-7 7.5-4-2-7-4-7-7.5v-4z" ${stroke(c, 2)}/>` +
      `<path d="M12 6v14c-4-2-7-4-7-7.5v-4z" fill="${c}"/>` +
      `<path d="M7 3h.5M12 3h.5M17 3h.5" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a blade with a star, attacks are holy and pierce (#1519).
  "judges-insight": [
    "enchantment",
    (c) =>
      `<path d="M4 20l9-9M6 14l4 4" ${stroke(c, 2.4)}/>` +
      `<path d="M17 3l1.4 3.6L22 8l-3.6 1.4L17 13l-1.4-3.6L12 8l3.6-1.4z" fill="${c}"/>`,
  ],
  // Enchantment: a ring round a mountain, cannot be knocked down (#1870).
  "aura-of-stability": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="8" ${stroke(c, 1.8)}/>` +
      `<path d="M7 16l4-7 2.5 4 2-2.5 2 5.5z" fill="${c}"/>`,
  ],
  // Enchantment: a ring round a heart, more maximum Health (#1872).
  "vital-blessing": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="8" ${stroke(c, 1.8)}/>` +
      `<path d="M12 16.5s-4.5-2.8-4.5-5.8A2.5 2.5 0 0 1 12 9a2.5 2.5 0 0 1 4.5 1.7c0 3-4.5 5.8-4.5 5.8z" fill="${c}"/>`,
  ],
  // Enchantment: a page of lines with a curl, Energy for each signet (#1913).
  "scribes-insight": [
    "enchantment",
    (c) =>
      `<path d="M7 4h10v11H7z" ${stroke(c, 2)}/>` +
      `<path d="M10 8h4M10 11h4" ${stroke(c, 1.6)}/>` +
      `<path d="M7 15q0 5 4 5h5" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a plus with a small shield, a heal for everyone on a block (#1974).
  "shield-guardian": [
    "enchantment",
    (c) =>
      `<path d="M9 3h5v5h5v5h-5v5H9v-5H4V8h5z" ${stroke(c, 2)}/>` +
      `<path d="M17 14l4 1.4v3c0 2-2 3.2-4 4-2-.8-4-2-4-4v-3z" fill="${c}"/>`,
  ],
  // Enchantment: a shield with an arrow bouncing back off it, the damage sent home.
  "reversal-of-damage": [
    "enchantment",
    (c) =>
      `<path d="M12 3.5l7 2.5v5.5c0 3.5-3 5.5-7 7.5-4-2-7-4-7-7.5V6z" ${stroke(c, 2)}/>` +
      `<path d="M3 5l9 8 6-6" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a dashed ring with a tick, a hex cleared on the beat.
  "spotless-mind": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="8" ${stroke(c, 2)} stroke-dasharray="3.4 2.6"/>` +
      `<path d="M8.5 12.5L11 15l4.5-6" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a drop with a tick, a condition cleared on the beat.
  "spotless-soul": [
    "enchantment",
    (c) =>
      `<path d="M12 3.5c3.5 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6 6-11z" ${stroke(c, 2)}/>` +
      `<path d="M9 14.5l2.3 2.3L15 12" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a burst, an arrow and a plus, damage turned to healing.
  "mark-of-protection": [
    "enchantment",
    (c) =>
      `<path d="M7 4l1 3 3 .5-2.5 2L9.5 13 7 11.2 4.5 13 5 9.5 2.5 7.5 5.5 7z" fill="${c}"/>` +
      `<path d="M11 10h4" ${stroke(c, 2)}/>` +
      `<path d="M18 6v10M13.5 11h9" ${stroke(c, 2.6)}/>`,
  ],
  // Enchantment: a shield on a chain link, held while maintained.
  "protective-bond": [
    "enchantment",
    (c) =>
      `<path d="M14 4l6 2.2v4.3c0 3-2.2 4.8-6 6.5-3.8-1.7-6-3.5-6-6.5V6.2z" ${stroke(c, 2)}/>` +
      `<rect x="3" y="13" width="8" height="5" rx="2.5" ${stroke(c, 1.8)} transform="rotate(35 7 15.5)"/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2421). */
const fits = {
  "mark-of-protection": [0.94, 0],
};

export default fitRows(rows, fits);
