// Armor icons (#2058): an insignia plate (a shield) with an emblem per
// insignia, and a rune stone (a diamond) with an emblem per universal rune or
// a profession glyph per attribute rune. The tier pips are drawn in CSS from
// `data-tier`, so a stone carries none. Emblems are drawn on a 12 unit box and
// set inside the plate or stone; ink only, so each reads with the colour out.

import { C, stroke } from "./icon-kit.mjs";

const ink = `fill="${C.ink}"`;
/** @param {string} d @param {number} [w] */
const line = (d, w = 1.8) => `<path d="${d}" ${stroke(C.ink, w)}/>`;
/** @param {string} d */
const solid = (d) => `<path d="${d}" ${ink}/>`;
/** @param {string} d @param {number} [w] */
const ring = (d, w = 1.6) => `<path d="${d}" ${stroke(C.ink, w)}/>`;
const dot = (/** @type {number} */ x, /** @type {number} */ y, r = 1.3) =>
  `<circle cx="${String(x)}" cy="${String(y)}" r="${String(r)}" ${ink}/>`;

/** Emblems on a 12 x 12 box. */
/** @type {Readonly<Record<string, string>>} */
const E = {
  cross: line("M6 1.5V10.5M1.5 6H10.5", 2.4),
  sun:
    `<circle cx="6" cy="6" r="2.6" ${ink}/>` +
    line(
      "M6 .6V2M6 10V11.4M.6 6H2M10 6H11.4M2.2 2.2L3.2 3.2M8.8 8.8L9.8 9.8M9.8 2.2L8.8 3.2M3.2 8.8L2.2 9.8",
      1.3,
    ),
  tower: solid("M2.5 11V4H3.5V2H5V4H7V2H8.5V4H9.5V11Z"),
  halo:
    ring("M2.5 3.4a3.5 1.3 0 1 0 7 0a3.5 1.3 0 1 0-7 0", 1.4) +
    dot(6, 7.6, 1.5) +
    line("M3.5 11.2Q6 8.6 8.5 11.2", 1.5),
  fist: solid(
    "M2 5.2Q2 3 3.4 3Q4.2 2.4 5 3Q5.8 2.4 6.6 3Q7.4 2.6 8.2 3Q10 3 10 5.2V8Q10 10.5 7 10.5H5Q2 10.5 2 8Z",
  ),
  eye: ring("M.8 6Q6 .8 11.2 6Q6 11.2 .8 6Z", 1.4) + dot(6, 6, 1.9),
  chevrons: line("M2 5.5L6 2L10 5.5M2 10L6 6.5L10 10", 2),
  helm: solid("M2 10.5V6A4 4 0 0 1 10 6V10.5H7.3V7.2H4.7V10.5Z"),
  stripes: line("M3 1.5V10.5M6 1.5V10.5M9 1.5V10.5", 1.8),
  diamond:
    solid("M6 .8L10.8 6L6 11.2L1.2 6Z") + `<path d="M1.5 6H10.5M6 1V11" ${stroke(C.bg, 0.9)}/>`,
  skull:
    solid("M6 1A4.2 4.2 0 0 1 9.6 7.4V9.8H2.4V7.4A4.2 4.2 0 0 1 6 1Z") +
    `<circle cx="4.4" cy="5.6" r="1.1" fill="${C.bg}"/><circle cx="7.6" cy="5.6" r="1.1" fill="${C.bg}"/>`,
  fang: solid("M2 2H10L9 4.5L7.2 11L6 7L4.8 11L3 4.5Z"),
  drop: solid("M6 .8Q10.2 5.4 10.2 7.4A4.2 4.2 0 0 1 1.8 7.4Q1.8 5.4 6 .8Z"),
  flame: solid(
    "M6 .6Q8 3.6 9.4 5.6Q10.6 7.6 9.4 9.4Q8 11.4 6 11.4Q4 11.4 2.6 9.4Q1.4 7.6 3.2 5.4Q4 6.4 4.6 6.6Q4.6 3 6 .6Z",
  ),
  leaf:
    solid("M1.6 10.4Q.8 3 10.4 1.6Q11.2 9 3.4 10.2L1.6 10.4Z") +
    `<path d="M2 10Q5 6 8.5 3.5" ${stroke(C.bg, 0.9)}/>`,
  bolt: solid("M7.4 .6L2.4 6.6H5.6L4.4 11.4L9.6 5.2H6.4Z"),
  mountain: solid("M.8 10.6L4.6 3.2L6.4 6.2L8 4.4L11.2 10.6Z"),
  snow: line("M6 1V11M1.7 3.5L10.3 8.5M10.3 3.5L1.7 8.5", 1.6),
  wind: line("M1.5 4H7Q9.4 4 9.4 2.4M1.5 6.6H9.4M1.5 9.2H6Q8.4 9.2 8.4 10.8", 1.6),
  spiral: line("M6 6Q6 4.6 7.4 4.6Q9 4.6 9 6.4Q9 9.4 5.8 9.4Q2.4 9.4 2.4 5.8Q2.4 2 6.4 2", 1.6),
  claw: line("M2.5 1.5L4.2 10.5M5.5 1.5L6.5 7.5M8.5 1.5L9.2 5", 1.8),
  boot: solid("M2.5 2H6V6.6L10.4 8.4V10.4H2.5Z"),
  x: line("M2 2L10 10M10 2L2 10", 2),
  bomb: `<circle cx="5.4" cy="7" r="3.8" ${ink}/>` + line("M7.4 3.8Q8.8 2 10.4 2.4", 1.3),
  spear: solid("M6 .6L9 5H7V11.4H5V5H3Z"),
  moon: solid("M8.8 1.6A5 5 0 1 0 10.6 8.4A4.2 4.2 0 0 1 8.8 1.6Z"),
  star: solid("M6 .8L7.5 4.3L11.2 4.6L8.4 7.1L9.2 10.8L6 8.9L2.8 10.8L3.6 7.1L.8 4.6L4.5 4.3Z"),
  gear:
    `<circle cx="6" cy="6" r="3" ${stroke(C.ink, 2.2)}/>` +
    line(
      "M6 .8V2M6 10V11.2M.8 6H2M10 6H11.2M2.3 2.3L3.1 3.1M8.9 8.9L9.7 9.7M9.7 2.3L8.9 3.1M3.1 8.9L2.3 9.7",
      1.5,
    ),
  note:
    solid("M5.4 8V1.6L10.4 .8V7.4") +
    `<ellipse cx="3.6" cy="8.6" rx="2" ry="1.5" ${ink}/><ellipse cx="8.6" cy="7.6" rx="2" ry="1.5" ${ink}/>`,
  anchor:
    line("M6 2V11M3 5H9M2 8Q3 10.6 6 10.6Q9 10.6 10 8", 1.7) +
    `<circle cx="6" cy="1.9" r="1" ${ink}/>`,
  book: solid(
    "M1.4 2.4H5.4Q6 2.4 6 3V10.4Q5.7 9.6 5 9.6H1.4ZM10.6 2.4H6.6Q6 2.4 6 3V10.4Q6.3 9.6 7 9.6H10.6Z",
  ),
  broken: ring("M9.6 4.2A4 4 0 1 0 9.6 7.8", 1.8) + line("M7.4 .8L9 3.2", 1.4),
  post: solid("M5 1H7V3.4H8.8V5.2H7V11H5V5.2H3.2V3.4H5Z"),
  anvil: solid("M1 3.4H11V5.4H7.4V7.2H9.4V9.8H2.6V7.2H4.6V5.4H1Z"),
  banner: solid("M2.4 1H3.8V11.4H2.4ZM3.8 1.4H10L8 3.9L10 6.4H3.8Z"),
  shield: solid("M6 1L10.4 2.6V6.2Q10.4 9.4 6 11.2Q1.6 9.4 1.6 6.2V2.6Z"),
  coffin: solid("M4 1H8L10 4.6L8 11H4L2 4.6Z"),
  twoskulls:
    solid("M3.4 2A2.7 2.7 0 0 1 5.8 5.4V7H1V5.4A2.7 2.7 0 0 1 3.4 2Z") +
    solid("M8.2 5A2.7 2.7 0 0 1 10.8 7.6V9.4H5.6V7.6A2.7 2.7 0 0 1 8.2 5Z"),
  bone:
    line("M2.2 9.8L9.8 2.2M2.2 2.2L9.8 9.8", 2.2) +
    dot(2, 2.2, 1.2) +
    dot(10, 2.2, 1.2) +
    dot(2, 9.8, 1.2) +
    dot(10, 9.8, 1.2),
  arrow: line("M1.6 10.4L9.6 2.4", 1.8) + solid("M5.6 1.6H10.4V6.4Z"),
  paw: `<circle cx="6" cy="8" r="2.6" ${ink}/><circle cx="2.4" cy="5" r="1.2" ${ink}/><circle cx="4.6" cy="2.6" r="1.2" ${ink}/><circle cx="7.4" cy="2.6" r="1.2" ${ink}/><circle cx="9.6" cy="5" r="1.2" ${ink}/>`,
  heart: solid("M6 10.6L1.6 6Q.6 3 3.2 2.2Q5 1.8 6 3.6Q7 1.8 8.8 2.2Q11.4 3 10.4 6Z"),
  hourglass: solid("M2.4 1H9.6L6.8 6L9.6 11H2.4L5.2 6Z"),
  spark: solid("M6 .6L7.4 4.6L11.4 6L7.4 7.4L6 11.4L4.6 7.4L.6 6L4.6 4.6Z"),
  clean:
    ring("M6 1.4A4.6 4.6 0 1 0 6 10.6A4.6 4.6 0 1 0 6 1.4", 1.5) +
    line("M3.8 6.2L5.4 7.8L8.4 4.4", 1.6),
  absorb:
    solid("M6 1L10.4 2.6V6.2Q10.4 9.4 6 11.2Q1.6 9.4 1.6 6.2V2.6Z") +
    `<path d="M3.4 6H8.6M6.8 4.2L8.6 6L6.8 7.8" ${stroke(C.bg, 1.2)}/>`,
  recover: line("M2.2 6A3.8 3.8 0 1 0 4 2.8", 1.6) + solid("M1.6 1.2L5.4 2.8L2.2 5.2Z"),
  restore:
    line("M6 1.6V10.4M1.6 6H10.4", 2.2) + `<circle cx="6" cy="6" r="4.6" ${stroke(C.ink, 1)}/>`,
};

/** The insignia emblem table: [emblem, profession or undefined, a mark in the corner]. */
/** @type {Readonly<Record<string, readonly [string, string | undefined, string?]>>} */
const INSIGNIA = {
  survivor: ["heart", undefined],
  radiant: ["sun", undefined],
  stalwart: ["tower", undefined],
  blessed: ["halo", undefined],
  brawlers: ["fist", undefined],
  sentrys: ["eye", undefined],
  knights: ["helm", "warrior"],
  sentinels: ["stripes", "warrior"],
  dreadnought: ["shield", "warrior"],
  nightstalkers: ["moon", "assassin"],
  infiltrators: ["x", "assassin"],
  saboteurs: ["bomb", "assassin"],
  vanguards: ["spear", "assassin"],
  prodigys: ["star", "mesmer"],
  artificers: ["gear", "mesmer"],
  virtuosos: ["note", "mesmer"],
  windwalker: ["wind", "dervish"],
  forsaken: ["broken", "dervish"],
  anchorites: ["anchor", "monk"],
  disciples: ["book", "monk"],
  wanderers: ["boot", "monk"],
  blighters: ["drop", "necromancer"],
  undertakers: ["coffin", "necromancer"],
  "minion-masters": ["twoskulls", "necromancer"],
  bonelace: ["bone", "necromancer"],
  shamans: ["post", "ritualist"],
  mystics: ["spiral", "ritualist"],
  "ghost-forge": ["anvil", "ritualist"],
  prismatic: ["diamond", "elementalist"],
  aeromancer: ["wind", "elementalist", "spark"],
  geomancer: ["mountain", "elementalist", "spark"],
  hydromancer: ["drop", "elementalist", "spark"],
  pyromancer: ["flame", "elementalist", "spark"],
  earthbound: ["mountain", "ranger"],
  frostbound: ["snow", "ranger"],
  pyrebound: ["flame", "ranger"],
  stormbound: ["bolt", "ranger"],
  scouts: ["arrow", "ranger"],
  beastmasters: ["paw", "ranger"],
  centurions: ["banner", "paragon"],
};

/** The universal runes' emblems. */
/** @type {Readonly<Record<string, string>>} */
const RUNE = {
  vigor: "heart",
  vitae: "drop",
  attunement: "bolt",
  clarity: "eye",
  purity: "clean",
  recovery: "recover",
  restoration: "restore",
  absorption: "absorb",
};

/** @param {string} name */
const emblemOf = (name) => {
  const emblem = E[name];
  if (emblem === undefined) throw new Error(`no emblem "${name}"`);
  return emblem;
};

/** @param {string} emblem @param {number} scale @param {number} cx @param {number} cy */
const place = (emblem, scale, cx, cy) =>
  `<g transform="translate(${String(cx)},${String(cy)}) scale(${String(scale)}) translate(-6,-6)">${emblemOf(emblem)}</g>`;

const SHIELD = "M12 1.8L21 5V12.2Q21 18.4 12 22.2Q3 18.4 3 12.2V5Z";
const STONE = "M12 1.6L22.4 12L12 22.4L1.6 12Z";

/** @param {string} body */
const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${body}</svg>\n`;

/**
 * @param {Readonly<Record<string, () => string>>} profession the profession silhouettes of icons.mjs
 * @param {(hex: string) => string} plateTint
 */
export function gearIcons(profession, plateTint) {
  /** @type {Record<string, string>} */
  const insignia = {};
  for (const [id, [emblem, owner, mark]] of Object.entries(INSIGNIA)) {
    const hue =
      owner === undefined
        ? C.inkDim
        : /** @type {string} */ (C[/** @type {keyof typeof C} */ (owner)]);
    insignia[id] = svg(
      `<path d="${SHIELD}" fill="${plateTint(hue)}" stroke="${hue}" stroke-width="1.4" stroke-linejoin="round"/>` +
        place(emblem, mark === undefined ? 1 : 0.85, 12, 11.6) +
        (mark === undefined
          ? ""
          : `<g transform="translate(15.2,5.6) scale(.4)">${emblemOf(mark)}</g>`),
    );
  }
  /** @type {Record<string, string>} */
  const rune = {};
  const stone = (/** @type {string} */ hue) =>
    `<path d="${STONE}" fill="${plateTint(hue)}" stroke="${hue}" stroke-width="1.4" stroke-linejoin="round"/>`;
  for (const [id, emblem] of Object.entries(RUNE)) {
    rune[id] = svg(stone(C.ink) + place(emblem, 0.78, 12, 11.2));
  }
  for (const [name, draw] of Object.entries(profession)) {
    rune[`attribute-${name}`] = svg(
      stone(/** @type {string} */ (C[/** @type {keyof typeof C} */ (name)])) +
        `<g transform="translate(12,11.4) scale(.42) translate(-12,-12)">${draw()}</g>`,
    );
  }
  return { insignia, rune };
}

/**
 * The standing figure of the paper-doll (#2058, #2059): front-facing, neutral,
 * hands out from the body so a weapon icon fits at each. 200 x 360, the
 * coordinates of `PAPER_DOLL_ANCHORS` in apps/web/src/ui/paper-doll-figure.ts.
 */
export function paperDollFigure() {
  /** @param {string} d @param {number} w @param {string} colour */
  const limb = (d, w, colour) =>
    `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${String(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const arms = "M70 96L42 150L30 206M130 96L158 150L170 206";
  const legs = "M86 196L84 272L84 338M114 196L116 272L116 338";
  const body = (/** @type {number} */ grow, /** @type {string} */ colour) =>
    limb(arms, 17 + grow, colour) +
    limb(legs, 25 + grow, colour) +
    `<rect x="${String(64 - grow / 2)}" y="${String(78 - grow / 2)}" width="${String(72 + grow)}" height="${String(118 + grow)}" rx="14" fill="${colour}"/>` +
    `<circle cx="100" cy="40" r="${String(25 + grow / 2)}" fill="${colour}"/>` +
    `<rect x="${String(90 - grow / 2)}" y="60" width="${String(20 + grow)}" height="24" fill="${colour}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 360" width="200" height="360">${body(3, C.inkDim)}${body(0, C.line)}</svg>\n`;
}
