// What the icon generator and its row tables share: the palette, the stroke
// helper, the germ glyph and the row types. Rows in skill-icons/ and
// status-icons/ import from here, never from icons.mjs, which runs on import.

/** The palette. Mirrors the tokens table in docs/art/art-direction.md. */
export const C = {
  bg: "#0e1116",
  plate: "#161b22",
  line: "#2b3440",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  condition: "#ffa657",
  hex: "#d2a8ff",
  enchantment: "#56d4dd",
  stance: "#f778ba",
  preparation: "#e3b341",
  glyph: "#c3e88d",
  weaponSpell: "#8b9cff",
  warrior: "#e3b341",
  ranger: "#8fd36b",
  monk: "#9ecbff",
  necromancer: "#3fb68b",
  mesmer: "#e87fd0",
  elementalist: "#ff6e5a",
  assassin: "#c0405e",
  ritualist: "#a9e5e0",
  paragon: "#f0883e",
  dervish: "#c9a27e",
};

/**
 * @param {string} colour
 * @param {number} [width]
 */
export const stroke = (colour, width = 2) =>
  `fill="none" stroke="${colour}" stroke-width="${String(width)}" stroke-linecap="round" stroke-linejoin="round"`;

/**
 * A germ (#765): a body and six knobbed spikes, so it never reads as a sun.
 * @param {string} c
 */
export const germ = (c) =>
  `<circle cx="12" cy="12" r="4.2" fill="${c}"/>` +
  [-90, -30, 30, 90, 150, 210]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      /** @param {number} r */
      const x = (r) => (12 + r * Math.cos(a)).toFixed(2);
      /** @param {number} r */
      const y = (r) => (12 + r * Math.sin(a)).toFixed(2);
      return (
        `<path d="M${x(4)} ${y(4)}L${x(7)} ${y(7)}" ${stroke(c, 1.8)}/>` +
        `<circle cx="${x(8.3)}" cy="${y(8.3)}" r="1.7" fill="${c}"/>`
      );
    })
    .join("");

/** @typedef {(colour: string) => string} Glyph */
/** @typedef {"condition" | "hex" | "enchantment" | "stance" | "preparation" | "glyph" | "shout" | "chant" | "echo" | "weapon-spell" | "item" | "form" | "skill-effect"} Category */

const BOLT = "M0 0L-4.5 7H-1L-2.5 13L4 4.5H0.5L2.5 0Z";

/**
 * "N for each X" (#1850): the counted thing and what it gives on top, three
 * pips under them, the count. An enchantment is a dashed ring, a condition a
 * drop, a foe a figure.
 * @param {"desecrate" | "defile" | "victory" | "sadist" | "channeling" | "zeal" | "vigor"} kind
 * @param {string} c colour
 * @param {number} w stroke width
 */
export const perEach = (kind, c, w) => {
  const ring = (/** @type {number} */ x, /** @type {number} */ r) =>
    `<circle cx="${String(x)}" cy="8" r="${String(r)}" ${stroke(c, w)} stroke-dasharray="3 2"/>`;
  const bolt = (/** @type {number} */ x, /** @type {number} */ y) =>
    `<path transform="translate(${String(x)},${String(y)})" d="${BOLT}" fill="${c}"/>`;
  const plus = (/** @type {number} */ x, /** @type {number} */ y) =>
    `<path d="M${String(x)} ${String(y - 3)}v6M${String(x - 3)} ${String(y)}h6" ${stroke(c, w + 0.6)}/>`;
  const drop = (/** @type {number} */ x) =>
    `<path transform="translate(${String(x)},0)" d="M0 2.5C0 2.5 -4.5 8 -4.5 11A4.5 4.5 0 0 0 4.5 11C4.5 8 0 2.5 0 2.5Z" fill="${c}"/>`;
  const top = {
    // A ring and a spark: each enchantment on the foes adds damage.
    desecrate:
      ring(7, 5) +
      `<path d="M18 2L19.8 6.2L24 8L19.8 9.8L18 14L16.2 9.8L12 8L16.2 6.2Z" fill="${c}"/>`,
    // The same ring with a cross: the other campaign version.
    defile: ring(7, 5) + `<path d="M15.5 3.5L22.5 12.5M22.5 3.5L15.5 12.5" ${stroke(c, w + 0.4)}/>`,
    // A drop, a plus and a bolt: each condition on a foe gives Health and Energy.
    victory: drop(5.5) + plus(13.5, 8) + bolt(20, 2.5),
    // A drop and a plus: each condition gives Health.
    sadist: drop(8) + plus(18, 8),
    // A foe figure and a bolt: each foe near gives Energy.
    channeling:
      `<circle cx="6.5" cy="5" r="2.6" ${stroke(c, w)}/>` +
      `<path d="M2 14C2 9 11 9 11 14" ${stroke(c, w)}/>` +
      bolt(18, 2),
    // A ring round a bolt: each enchantment gives Energy.
    zeal: ring(12, 6.5) + bolt(12.4, 3.3),
    // A ring round a plus: each enchantment gives Health.
    vigor: ring(12, 6.5) + plus(12, 8),
  }[kind];
  return (
    top +
    `<circle cx="6" cy="21" r="1.7" fill="${c}"/><circle cx="12" cy="21" r="1.7" fill="${c}"/><circle cx="18" cy="21" r="1.7" fill="${c}"/>`
  );
};

/**
 * Shadow Step and return (#1847): a figure or mark on top, and the way back
 * under it, a U-turn arrow. One step out, one step home. `Return` itself has
 * no way back and does not use this.
 * @param {"fang" | "aura" | "meld" | "haste"} kind
 * @param {string} c colour
 * @param {number} w stroke width
 */
export const stepAndReturn = (kind, c, w) => {
  const top = {
    // Two fangs: the foe gets a Deep Wound when it ends.
    fang: `<path d="M4.5 1.5H10.5L7.5 12.5ZM13.5 1.5H19.5L16.5 12.5Z" fill="${c}"/>`,
    // A foe in a dashed ring: its aura pulls you to it.
    aura:
      `<circle cx="12" cy="7" r="5.5" ${stroke(c, w)} stroke-dasharray="3 2"/>` +
      `<circle cx="12" cy="7" r="2.2" fill="${c}"/>`,
    // An ally figure and its outlined ghost: you meld to them.
    meld:
      `<circle cx="8.5" cy="5" r="2.6" fill="${c}"/>` +
      `<path d="M3 13C3 8.5 14 8.5 14 13Z" fill="${c}"/>` +
      `<path d="M10.5 13C10.5 9 21.5 9 21.5 13" ${stroke(c, w)}/>` +
      `<circle cx="16" cy="5" r="2.6" ${stroke(c, w)}/>`,
    // An arrowhead trailing speed lines.
    haste:
      `<path d="M12.5 2L22 7.5L12.5 13Z" fill="${c}"/>` +
      `<path d="M2 4H9M2 7.5H10M2 11H9" ${stroke(c, w)}/>`,
  }[kind];
  return top + `<path d="M21 15v1.5a4 4 0 0 1-4 4H5M8.5 17L5 20.5L8.5 24" ${stroke(c, w)}/>`;
};
