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

/**
 * Own-skill modifiers (#1855): the skill that changes how other skills work.
 * Each has its own dominant shape, so the four Monk ones read apart: a halo,
 * a ring round a figure, two hands, a plus trailing streaks.
 * @param {"spirit" | "aura" | "covenant" | "haste" | "stance" | "extend"} kind
 * @param {string} c colour
 * @param {number} w stroke width
 */
export const ownSkill = (kind, c, w) =>
  ({
    // A halo over an energy orb: Monk spells cost less.
    spirit:
      `<ellipse cx="12" cy="4.5" rx="6.5" ry="2.2" ${stroke(c, w)}/>` +
      `<circle cx="12" cy="15" r="6.5" ${stroke(c, w)}/>` +
      `<path d="M13 10.5L10 15.5H14L11 19.5" ${stroke(c, w)}/>`,
    // A figure in a ring that runs on past its start: enchantments last longer.
    aura:
      `<circle cx="12" cy="9.5" r="2.6" fill="${c}"/>` +
      `<path d="M7.5 18C7.5 13 16.5 13 16.5 18Z" fill="${c}"/>` +
      `<path d="M12 2.5A9.5 9.5 0 1 1 2.8 9.5M2.8 4.5V9.5H7.8" ${stroke(c, w)}/>`,
    // Two hands clasped under a small plus: cheaper, lesser heals.
    covenant:
      `<path d="M12 2V8M9 5H15" ${stroke(c, w)}/>` +
      `<path d="M2 20L8 13L12 17L16 13L22 20" ${stroke(c, w + 1.2)}/>`,
    // A big plus trailing three streaks: healing cast faster.
    haste:
      `<path d="M16 4V20M8.5 12H23.5" ${stroke(c, w + 0.6)}/>` +
      `<path d="M1.5 6.5H8M1.5 12H5M1.5 17.5H8" ${stroke(c, w)}/>`,
    // A bow beside a circular arrow: preparations recharge sooner.
    stance:
      `<path d="M3.5 3Q11 12 3.5 21V3" ${stroke(c, w)}/>` +
      `<path d="M21.5 15.5A6 6 0 1 1 19.8 7M20.3 3.2V7.2H16.3" ${stroke(c, w)}/>`,
    // A dashed enchantment ring drawn out long: the next one lasts longer.
    extend:
      `<ellipse cx="12" cy="9" rx="10" ry="5.5" ${stroke(c, w)} stroke-dasharray="3 2"/>` +
      `<path d="M5 19H19M16 16L19 19L16 22" ${stroke(c, w)}/>`,
  })[kind];
