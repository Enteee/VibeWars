import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Necromancer status art (#2277).
  // Enchantment: a drop over three regeneration arrows, energy bought with blood.
  "blood-is-power": [
    "enchantment",
    (c) =>
      `<path d="M12 3c2 3 3.5 4.5 3.5 6.5a3.5 3.5 0 0 1-7 0C8.5 7.5 10 6 12 3z" fill="${c}"/>` +
      `<path d="M6 19l2.5-2.5L11 19M10 19l2.5-2.5L15 19M14 19l2.5-2.5L19 19" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a hollow drop with an arrow rising in it, regeneration that pays out.
  "blood-renewal": [
    "enchantment",
    (c) =>
      `<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 18v-6M9.5 14.5L12 12l2.5 2.5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a mouth crossed out, no shouts or chants.
  "vocal-minority": [
    "hex",
    (c) =>
      `<path d="M6 12c2-3 10-3 12 0-2 3-10 3-12 0z" ${stroke(c, 2)}/>` +
      `<path d="M5 19L19 5" ${stroke(c, 2.2)}/>`,
  ],
  // Hex: a horn with sound lines, a shout or chant that hurts.
  cacophony: [
    "hex",
    (c) =>
      `<path d="M5 9h4l5-4v14l-5-4H5z" fill="${c}"/>` +
      `<path d="M17 8l3-2M17 12h4M17 16l3 2" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: a skull with the strike ticks of a harder blow, minions that hit harder.
  "order-of-undeath": [
    "skill-effect",
    (c) =>
      `<path d="M12 4a6.5 6.5 0 0 1 4 11.6V19H8v-3.4A6.5 6.5 0 0 1 12 4z" ${stroke(c, 1.8)}/>` +
      `<circle cx="9.7" cy="11.5" r="1.5" fill="${c}"/><circle cx="14.3" cy="11.5" r="1.5" fill="${c}"/>` +
      `<path d="M3.5 6l2 2M20.5 6l-2 2" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a zero struck through, every attribute gone.
  "wail-of-doom": [
    "hex",
    (c) =>
      `<ellipse cx="12" cy="12" rx="5" ry="7" ${stroke(c, 2.2)}/>` +
      `<path d="M6 19L18 5" ${stroke(c, 2)}/>`,
  ],
  // Hex: one bar fallen to the floor, the primary attribute gone.
  atrophy: [
    "hex",
    (c) =>
      `<path d="M5 19h14" ${stroke(c, 2.2)}/>` +
      `<path d="M8 16V8M12 16V5M16 16v-1" ${stroke(c, 2)}/>`,
  ],
  // Hex: a spine with a snowflake, cold breaks the cast.
  "spinal-shivers": [
    "hex",
    (c) =>
      `<path d="M8 3v18M5.5 6h5M5.5 10h5M5.5 14h5M5.5 18h5" ${stroke(c, 1.8)}/>` +
      `<path d="M17 8v8M13.5 10l7 4M20.5 10l-7 4" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
