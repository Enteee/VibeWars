// The helpers glyphs and modifiers draw with (#2021): marks, frames and
// families shared by the files in glyphs/ and modifiers/. `glyph` draws
// another glyph by name, for a glyph built from others.

import { C, stroke } from "./icon-kit.mjs";

/** @param {string} d */
export const inkFill = (d) =>
  `<path d="${d}" fill="${C.ink}" stroke="${C.bg}" stroke-width="1" stroke-linejoin="round"/>`;
/** @param {string} d @param {number} [w] */
export const inkLine = (d, w = 2.2) => `<path d="${d}" ${stroke(C.ink, w)}/>`;

/** The dashed ring of a hex, as a skill icon's frame (#1534). */
export const HEX_RING = `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>`;

/** A punisher's picture, shrunk inside the hex ring that marks the family (#1534). @param {string} inner */
export const punisher = (inner) =>
  HEX_RING + `<g transform="translate(12,12) scale(0.72) translate(-12,-12)">${inner}</g>`;
/** A shield outline with `fillPath` filled in: the share of damage it blocks (#1541). @param {string} fillPath */
export const blockShield = (fillPath) =>
  `<path d="${fillPath}" fill="${C.ink}"/>` +
  `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.4)}/>`;

/** A burst of `n` points around the centre, alternating two radii. @param {number} n */
export const burst = (n) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 === 0 ? 9.5 : 4.5;
    return `${i === 0 ? "M" : "L"}${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
  }).join("") + "Z";

/**
 * The sword shifted down and right, with a mark in the freed corner.
 * @param {string} mark
 */
export const bladeMark = (mark) =>
  `<g transform="translate(2.5,2.5)">${inkLine("M5.5 18.5L19 5", 2.6)}${inkLine("M7 11.5L12.5 17", 2.4)}${inkLine("M4 20l2-2", 2.6)}</g>` +
  mark;

/**
 * The resurrect figure, scaled and centred on a point.
 * @param {number} cx
 * @param {number} cy
 * @param {number} k
 */
export const smallFigure = (cx, cy, k) =>
  `<g transform="translate(${String(cx)},${String(cy)}) scale(${String(k)}) translate(-12,-12.5)">` +
  `<ellipse cx="12" cy="7.5" rx="4" ry="4.5" ${stroke(C.ink, 2.2)}/>` +
  inkLine("M12 12V21M6 14.5H18", 2.6) +
  "</g>";

/**
 * A skull with dark sockets, scaled and centred on a point.
 * @param {number} cx
 * @param {number} cy
 * @param {number} k
 */
export const smallSkull = (cx, cy, k) =>
  `<g transform="translate(${String(cx)},${String(cy)}) scale(${String(k)}) translate(-12,-12)">` +
  inkFill("M12 2.5a8 8 0 0 1 5 14.2V21.5H7V16.7A8 8 0 0 1 12 2.5z") +
  `<circle cx="9" cy="11" r="2" fill="${C.bg}"/><circle cx="15" cy="11" r="2" fill="${C.bg}"/>` +
  `<path d="M10.5 17V21M13.5 17V21" stroke="${C.bg}" stroke-width="1.2"/>` +
  "</g>";

/**
 * A paw print in the box 3..21: a pad and four toes.
 * @param {string} fill
 */
export const pawPrint = (fill) =>
  `<ellipse cx="12" cy="16" rx="4.5" ry="3.8" fill="${fill}"/>` +
  `<circle cx="5.5" cy="10.5" r="2" fill="${fill}"/><circle cx="9.5" cy="6.5" r="2" fill="${fill}"/>` +
  `<circle cx="14.5" cy="6.5" r="2" fill="${fill}"/><circle cx="18.5" cy="10.5" r="2" fill="${fill}"/>`;

/** Glyphs, drawn in the box 3..21; the plate scales them to leave the corner free. */
/**
 * Spikes round a dot, as a flame burst.
 * @param {number} inner where the spikes start
 * @param {number} outer where they end
 * @param {number} width spike stroke width
 * @param {boolean} [dot] the centre dot
 */
export const flameRing = (inner, outer, width, dot = true) => {
  let d = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    /** @param {number} r */
    const x = (r) => (12 + Math.cos(a) * r).toFixed(1);
    /** @param {number} r */
    const y = (r) => (12 + Math.sin(a) * r).toFixed(1);
    d += `M${x(inner)} ${y(inner)}L${x(outer)} ${y(outer)}`;
  }
  return inkLine(d, width) + (dot ? `<circle cx="12" cy="12" r="2.2" fill="${C.ink}"/>` : "");
};

/** What a "with their next skill" chant waits for: a mark in the top left corner (#1497). */
export const nextTrigger = {
  // A small blade: an attack skill.
  attack: () => inkLine("M2.5 10L9.5 3", 2) + inkLine("M3.4 5.6L7 9.2", 1.8),
  // A four-point star: a spell.
  spell: () => inkFill("M6 1.2L7.5 4.5L10.8 6L7.5 7.5L6 10.8L4.5 7.5L1.2 6L4.5 4.5Z"),
  // A ring round a dot: a signet.
  signet: () =>
    `<circle cx="6" cy="6" r="3.6" ${stroke(C.ink, 1.8)}/><circle cx="6" cy="6" r="1" fill="${C.ink}"/>`,
  // Sound arcs: a shout or a chant.
  chant: () => inkLine("M3 3.2C5.2 5 5.2 7 3 8.8M7 1.8C10.4 4.6 10.4 7.4 7 10.2", 1.7),
  // Three dots: any of its next several skills.
  any: () =>
    [2.4, 6, 9.6].map((x) => `<circle cx="${String(x)}" cy="6" r="1.2" fill="${C.ink}"/>`).join(""),
};

/** The trigger mark top left, the payoff glyph shrunk beside and below it (#1497). */
export const nextSkill = (
  /** @type {keyof typeof nextTrigger} */ trigger,
  /** @type {string} */ payoff,
) => {
  return (
    `<g transform="translate(15.5,15) scale(0.62) translate(-12,-12)">${glyph(payoff)}</g>` +
    `<g>${nextTrigger[trigger]()}</g>`
  );
};

/** A hex ring round a small struck spell orb and `target`, the mark that says whom (#1498). @param {string} target */
export const hexFail = (target) =>
  `<circle cx="12" cy="12" r="8.5" ${stroke(C.ink, 2.2)} stroke-dasharray="4.2 3.2"/>` +
  `<circle cx="7.6" cy="10.5" r="2" fill="${C.ink}"/>` +
  `<path d="M5.4 13L9.8 8" ${stroke(C.bg, 1.3)}/>` +
  target;

/** An urn of held ashes round `mark`, the Ritualist's Was spells (#1493). @param {string} mark */
export const wasUrn = (mark) =>
  inkLine("M7 3H17M8.5 3V6.5L5 11V18L7.5 21.5H16.5L19 18V11L15.5 6.5V3", 2) + mark;

/**
 * The anti-summon family (#1568): the skill's own mark shrunk to the top left, a small ghost struck through
 * at the bottom right, the summoned creature it hits harder. @param {string} main
 */
export const antiSummon = (main) =>
  `<g transform="translate(-0.5,-0.5) scale(0.74)">${main}</g>` +
  `<g transform="translate(12.3,12.3) scale(0.62)" stroke="${C.bg}" stroke-width="3" paint-order="stroke">` +
  `<path d="M3.5 22V9A5.5 5.5 0 0 1 14.5 9V22L12.2 19.8L9 22L5.8 19.8Z" fill="${C.ink}"/>` +
  `<circle cx="6.8" cy="9.5" r="1.3" fill="${C.bg}" stroke="none"/><circle cx="11.2" cy="9.5" r="1.3" fill="${C.bg}" stroke="none"/></g>` +
  `<path d="M12 23.5L23.5 12" ${stroke(C.bg, 3.4)}/>` +
  `<path d="M12.5 23L23 12.5" ${stroke(C.ink, 1.4)}/>`;

/** The blood drop, a sacrifice (#1572). */
export const DROP = inkFill("M12 2.5C16 8.5 19 12 19 15.5A7 7 0 0 1 5 15.5C5 12 8 8.5 12 2.5Z");

/** A drop given up at the bottom left, `payoff` at the top right (#1572). @param {string} payoff */
export const sacrifice = (payoff) =>
  `<g transform="translate(7.5,16) scale(0.66) translate(-12,-12)">${DROP}</g>` +
  `<g transform="translate(15,9) scale(0.7) translate(-12,-12)">${payoff}</g>`;

/** A four-point star, the holy mark of the Monk's smiting skills (#1584). */
export const holyStar = (
  /** @type {number} */ cx,
  /** @type {number} */ cy,
  /** @type {number} */ r,
) => {
  const k = r * 0.28;
  const p = (/** @type {number} */ x, /** @type {number} */ y) =>
    `${(cx + x).toFixed(1)} ${(cy + y).toFixed(1)}`;
  return inkFill(
    `M${p(0, -r)}L${p(k, -k)}L${p(r, 0)}L${p(k, k)}L${p(0, r)}L${p(-k, k)}L${p(-r, 0)}L${p(-k, -k)}Z`,
  );
};

/** A signet ring and its dot at `cx,cy`, radius `r` (#1584). */
export const ringDot = (
  /** @type {number} */ cx,
  /** @type {number} */ cy,
  /** @type {number} */ r,
) =>
  `<circle cx="${String(cx)}" cy="${String(cy)}" r="${String(r)}" ${stroke(C.ink, 2.2)}/>` +
  `<circle cx="${String(cx)}" cy="${String(cy)}" r="${String(r / 3)}" fill="${C.ink}"/>`;

/** The curved arrow of the taken marks, from the top right down to the bottom left (#1946). */
export const takeArrow = () =>
  inkLine("M14 9C9 10 8 12 8 15", 1.8) + inkLine("M5.5 13L8 16L10.5 13", 1.8);
/** The source ring (or dashed hex ring) top right; `struck` crosses it out. @param {boolean} hexed @param {boolean} struck */
export const takeSrc = (hexed, struck) =>
  `<circle cx="17" cy="7" r="4.2" ${stroke(C.ink, 2)}${hexed ? ' stroke-dasharray="3.2 2.5"' : ""}/>` +
  (struck ? inkLine("M15 5L19 9M19 5L15 9", 1.6) : "");
/** The copy bottom left: a solid disc when it is yours, a ring when only revealed. @param {boolean} hexed @param {boolean} solid */
export const takeCopy = (hexed, solid) =>
  solid
    ? `<circle cx="7" cy="18" r="3.6" fill="${C.ink}"/>`
    : `<circle cx="7" cy="18" r="3.4" ${stroke(C.ink, 2)}${hexed ? ' stroke-dasharray="3.2 2.5"' : ""}/>`;
/** @param {string} src @param {string} copy */
export const takeMark = (src, copy) => src + takeArrow() + copy;
/** Three attribute bars cut down to stubs (#1946). */
export const barStubs = () => inkFill("M3 17H8V21H3ZM9.5 17H14.5V21H9.5ZM16 17H21V21H16Z");

/** A spear standing on the left of the icon, the Paragon's thrown spears keep the right free (#1508). */
export const sideSpear = () => inkLine("M7 21V9", 2.4) + inkFill("M7 2.5L11.5 10H2.5Z");

/** A health bar along the bottom edge, filled to `fill`: the cue for "above" or "below half". */
export const healthGauge = (/** @type {number} */ fill) =>
  `<rect x="2.5" y="18.5" width="19" height="3.5" rx="1" ${stroke(C.ink, 1.4)}/>` +
  `<rect x="3.5" y="19.5" width="${(17 * fill).toFixed(1)}" height="1.5" fill="${C.ink}"/>` +
  inkLine("M12 17.5V23", 1.2);

/**
 * A dagger (or a pair) up and to the left with a rider glyph in the bottom right corner on a plate of its own (#1653).
 * @param {string} rider A glyph body, drawn in the 24 box and shrunk here.
 * @param {boolean} [pair] Two blades instead of one.
 */
export const strikeWith = (rider, pair = false) =>
  (pair
    ? `<g transform="translate(6.5,8) scale(0.62) translate(-12,-12)">${glyph("dagger")}</g>` +
      `<g transform="translate(11,5) scale(0.62) translate(-12,-12)">${glyph("dagger")}</g>`
    : `<g transform="translate(9,9) scale(0.74) translate(-12,-12)">${glyph("dagger")}</g>`) +
  `<circle cx="17.5" cy="17.5" r="6" fill="${C.bg}"/>` +
  `<g transform="translate(17.5,17.5) scale(0.5) translate(-12,-12)">${rider}</g>`;

/**
 * The mantra frame: a rounded square, the enchantment's plate, round a mark scaled to fit (#1981).
 * @param {string} inner
 */
export const mantra = (inner) =>
  `<path d="M1.5 6.5V3.5Q1.5 1.5 3.5 1.5H6.5M17.5 1.5H20.5Q22.5 1.5 22.5 3.5V6.5M22.5 17.5V20.5Q22.5 22.5 20.5 22.5H17.5M6.5 22.5H3.5Q1.5 22.5 1.5 20.5V17.5" ${stroke(C.ink, 1.6)}/>` +
  `<g transform="translate(12,12) scale(0.78) translate(-12,-12)">${inner}</g>`;

/** The ringed plus in the bottom right corner: Health healed (#1666). */
export const healBadge = () =>
  `<circle cx="18.5" cy="18" r="4.8" fill="${C.bg}"/><circle cx="18.5" cy="18" r="4.3" ${stroke(C.ink, 1.5)}/>` +
  inkLine("M18.5 15.7V20.3M16.2 18H20.8", 1.5);

/** An element glyph with the ringed energy bolt in the corner: the Attunements' shared cue (#1646). */
export const attune = (/** @type {string} */ element) =>
  `<g transform="translate(10.5,10) scale(0.78) translate(-12,-12)">${element}</g>` +
  `<circle cx="18.5" cy="18" r="4.6" fill="${C.bg}"/><circle cx="18.5" cy="18" r="4.2" ${stroke(C.ink, 1.5)}/>` +
  `<g transform="translate(18.5,18) scale(0.3) translate(-12,-12)">${glyph("energy")}</g>`;

/** Small marks drawn in a 24-box, for the ringed corner of a weapon icon (#1672). */
export const RIDER = {
  weak: inkLine("M4 5L12 13L20 5M4 13L12 21L20 13", 4),
  limp: inkLine("M15 2L8 10L16 14L9 22", 4),
  burst: inkFill(burst(6)),
  drop: inkFill("M12 2C12 2 4 12 4 16A8 8 0 0 0 20 16C20 12 12 2 12 2Z"),
  daze: [
    [4, 17],
    [12, 6],
    [20, 17],
  ]
    .map(([x, y]) => `<circle cx="${String(x)}" cy="${String(y)}" r="3.4" fill="${C.ink}"/>`)
    .join(""),
  blind:
    inkLine("M2 12C5 6 8 5 12 5S19 6 22 12C19 18 16 19 12 19S5 18 2 12Z", 3.4) +
    inkLine("M4 21L20 3", 3.4),
  ring: `<path d="M12 2.5A9.5 9.5 0 0 1 21.5 12M19 18A9.5 9.5 0 0 1 8 21M4.5 17A9.5 9.5 0 0 1 4.5 7" ${stroke(C.ink, 3.6)}/>`,
  run: inkLine("M3 4L11 12L3 20M12 4L20 12L12 20", 4),
  plus: inkLine("M12 3V21M3 12H21", 5),
  bars: inkLine("M5 22V16M12 22V10M19 22V4", 5),
  crack: inkLine("M4 3L11 10L6 14L15 21", 4),
};

/** The riders of the "not" condition (#1715): what the foe lacks, struck through. */
export const NOT = {
  ring: `<circle cx="12" cy="12" r="8" ${stroke(C.ink, 3.4)}/>` + inkLine("M3 21L21 3", 3.4),
  chant: inkLine("M5 5C9 8 9 16 5 19M12 3C19 8 19 16 12 21M3 21L21 3", 3.2),
  skill:
    `<rect x="4" y="4" width="16" height="16" rx="2" ${stroke(C.ink, 3.4)}/>` +
    inkLine("M3 21L21 3", 3.4),
};

/** A weapon up and left, a rider in a ring at the bottom right (#1672). */
export const riderOn = (/** @type {string} */ weapon, /** @type {string} */ rider) =>
  `<g transform="translate(10,10) scale(0.84) translate(-12,-12)">${weapon}</g>` +
  `<circle cx="18" cy="18" r="5.6" fill="${C.bg}"/>` +
  `<g transform="translate(18,18) scale(0.38) translate(-12,-12)">${rider}</g>`;

/** The form mark: a figure's outline, dashed (#1968). */
export const formShell = () =>
  `<circle cx="12" cy="5.5" r="3.2" ${stroke(C.ink, 1.8)} stroke-dasharray="3 2.2"/>` +
  `<path d="M3.5 22V17Q3.5 10.5 12 10.5Q20.5 10.5 20.5 17V22Z" ${stroke(C.ink, 1.8)} stroke-dasharray="3.2 2.4"/>`;

/** The shared spirit post of the attacking spirits, left of the mark it shoots (#1271). */
export const spiritPost = () =>
  inkFill("M4.8 11H9.2L9.4 20H4.6Z") + `<circle cx="7" cy="6.8" r="3.4" fill="${C.ink}"/>`;

/** A spirit post centred on `cx` broken: the head thrown off the stump (#1309). */
export const brokenPost = (/** @type {number} */ cx) =>
  `<g transform="translate(${String(cx - 7)},0)">` +
  inkFill("M4.8 14.5H9.2L9.4 20H4.6Z") +
  `<circle cx="5.6" cy="7" r="3.2" fill="${C.ink}"/>` +
  inkLine("M7 11.2L8.4 12.4M9.6 9.6L11 8.4", 1.8) +
  "</g>";

/** The spirit post wearing a halo: a creature at its birth (#1316). */
export const bornPost = () =>
  spiritPost() + `<circle cx="7" cy="6.8" r="6" ${stroke(C.ink, 1.8)}/>`;

/**
 * A glyph of the vocabulary: what it draws, and what it means, in one line.
 * @typedef {{ readonly draw: () => string, readonly means: string }} GlyphEntry
 */

/** @type {Readonly<Record<string, GlyphEntry>> | undefined} */
let vocabulary;

/** Hands `glyph` the merged table, once glyph-table.mjs has loaded it. @param {Readonly<Record<string, GlyphEntry>>} glyphs */
export const useGlyphs = (glyphs) => {
  vocabulary = glyphs;
};

/** Draws the glyph `name`. @param {string} name */
export const glyph = (name) => {
  const entry = vocabulary?.[name];
  if (entry === undefined) throw new Error(`no glyph "${name}"`);
  return entry.draw();
};
