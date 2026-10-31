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
