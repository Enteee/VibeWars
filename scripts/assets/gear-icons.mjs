// Armor icons (#2058): an insignia plate (a shield) with an emblem per
// insignia, and a rune stone (a diamond) with an emblem per universal rune or
// a profession glyph per attribute rune. The tier pips are drawn in CSS from
// `data-tier`, so a stone carries none. Emblems are drawn on a 12 unit box and
// set inside the plate or stone; ink only, so each reads with the colour out.

import { C, stroke } from "./icon-kit.mjs";
import { HELD } from "../../apps/web/src/ui/paper-doll-figure.ts";

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
    line("M2.4 9.6L9.6 2.4M2.4 2.4L9.6 9.6", 2) +
    dot(1.8, 1.8, 1.7) +
    dot(10.2, 1.8, 1.7) +
    dot(1.8, 10.2, 1.7) +
    dot(10.2, 10.2, 1.7),
  waves: line(
    "M.8 3.4Q2.4 1.6 4 3.4T7.2 3.4T11.2 3.4M.8 6.6Q2.4 4.8 4 6.6T7.2 6.6T11.2 6.6M.8 9.8Q2.4 8 4 9.8T7.2 9.8T11.2 9.8",
    1.5,
  ),
  dagger: solid("M6 .6L7.8 6.8H4.2Z") + line("M2.6 7.4H9.4M6 7.6V11.2", 1.7),
  bubbles:
    ring("M3.6 8.2a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0", 1.5) +
    ring("M1.4 3.4a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0", 1.3) +
    ring("M7 2.8a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0", 1.3),
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
  infiltrators: ["dagger", "assassin"],
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
  blighters: ["bubbles", "necromancer"],
  undertakers: ["coffin", "necromancer"],
  "minion-masters": ["twoskulls", "necromancer"],
  bonelace: ["bone", "necromancer"],
  shamans: ["post", "ritualist"],
  mystics: ["spiral", "ritualist"],
  "ghost-forge": ["anvil", "ritualist"],
  prismatic: ["diamond", "elementalist"],
  aeromancer: ["wind", "elementalist", "spark"],
  geomancer: ["mountain", "elementalist", "spark"],
  hydromancer: ["waves", "elementalist", "spark"],
  pyromancer: ["flame", "elementalist", "spark"],
  earthbound: ["mountain", "ranger"],
  frostbound: ["snow", "ranger"],
  pyrebound: ["flame", "ranger"],
  stormbound: ["bolt", "ranger"],
  scouts: ["arrow", "ranger"],
  beastmasters: ["paw", "ranger"],
  centurions: ["banner", "paragon"],
};

/** The universal runes' [emblem, stone colour]: health is red and green, energy blue, the rest apart. */
/** @type {Readonly<Record<string, readonly [string, string]>>} */
const RUNE = {
  vigor: ["heart", "#ff6e5a"],
  vitae: ["drop", "#8fd36b"],
  attunement: ["bolt", "#4f8cff"],
  clarity: ["eye", "#56d4dd"],
  purity: ["clean", "#ffa657"],
  recovery: ["recover", "#e3b341"],
  restoration: ["restore", "#f778ba"],
  absorption: ["absorb", "#d2a8ff"],
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
  for (const [id, [emblem, hue]] of Object.entries(RUNE)) {
    // A solid stone with a dark emblem: the ink and the dark swap, so each
    // stone is told apart by colour as well as by shape at 18 px.
    const swapped = place(emblem, 0.92, 12, 11.4)
      .replaceAll(C.ink, "@")
      .replaceAll(C.bg, hue)
      .replaceAll("@", C.bg);
    rune[id] = svg(
      `<path d="${STONE}" fill="${hue}" stroke="${C.ink}" stroke-width="1.2" stroke-linejoin="round"/>` +
        swapped,
    );
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

// Held items (#2154): what the paper-doll holds, drawn upright in the
// figure's own units from `HELD`, so the client places each by its grip
// alone. Flat shapes in the figure's style: a base tone, a light edge down
// the left, a darker shade down the right, an `edge` outline.
const M = {
  edge: "#0b0f14",
  steel: "#aeb8c6",
  steelLight: "#e6ecf3",
  steelDark: "#6c7789",
  wood: "#8a6845",
  woodDark: "#5c4430",
  leather: "#6b4a35",
  leatherLight: "#8d6649",
  brass: "#c9a24a",
  brassDark: "#8a6a2a",
  horn: "#d8c7a1",
  hornDark: "#9c8a63",
  gem: "#8b9cff",
  gemLight: "#d0d8ff",
};

const n = (/** @type {number} */ v) => String(Math.round(v * 10) / 10);
/** @param {string} d @param {string} fill @param {number} [w] */
const shape = (d, fill, w = 1.4) =>
  `<path d="${d}" fill="${fill}" stroke="${M.edge}" stroke-width="${String(w)}" stroke-linejoin="round"/>`;
/** @param {string} d @param {string} colour @param {number} w */
const streak = (d, colour, w) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${String(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** A rectangle centred on `cx`, from `y0` down to `y1`. */
const bar = (
  /** @type {number} */ cx,
  /** @type {number} */ w,
  /** @type {number} */ y0,
  /** @type {number} */ y1,
) => `M${n(cx - w / 2)} ${n(y0)}H${n(cx + w / 2)}V${n(y1)}H${n(cx - w / 2)}Z`;
/** A round shaft of wood: base, a light left edge, a dark right edge. */
const shaft = (
  /** @type {number} */ cx,
  /** @type {number} */ w,
  /** @type {number} */ y0,
  /** @type {number} */ y1,
) =>
  shape(bar(cx, w, y0, y1), M.wood) +
  streak(`M${n(cx - w / 4)} ${n(y0 + 2)}V${n(y1 - 2)}`, "#a8865f", w / 4) +
  streak(`M${n(cx + w / 4)} ${n(y0 + 2)}V${n(y1 - 2)}`, M.woodDark, w / 4);
/** A leather wrap on a grip, `bands` turns. */
const wrap = (
  /** @type {number} */ cx,
  /** @type {number} */ w,
  /** @type {number} */ y0,
  /** @type {number} */ y1,
  bands = 4,
) =>
  shape(bar(cx, w, y0, y1), M.leather, 1.2) +
  Array.from({ length: bands }, (_, i) => {
    const y = y0 + ((i + 0.5) * (y1 - y0)) / bands;
    return streak(
      `M${n(cx - w / 2 + 1)} ${n(y + 1.5)}L${n(cx + w / 2 - 1)} ${n(y - 1.5)}`,
      M.leatherLight,
      1.1,
    );
  }).join("");
/** A pommel or cap, round. */
const knob = (
  /** @type {number} */ cx,
  /** @type {number} */ cy,
  /** @type {number} */ r,
  fill = M.brass,
) =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" stroke="${M.edge}" stroke-width="1.2"/>` +
  `<circle cx="${n(cx - r / 3)}" cy="${n(cy - r / 3)}" r="${n(r / 3)}" fill="${M.steelLight}" opacity=".55"/>`;
/** A double-edged blade from `y0` (the guard) to its point at `top`, `w` wide. */
const blade = (
  /** @type {number} */ cx,
  /** @type {number} */ w,
  /** @type {number} */ y0,
  /** @type {number} */ top,
) => {
  const shoulder = top + w * 1.6;
  return (
    shape(
      `M${n(cx - w / 2)} ${n(y0)}V${n(shoulder)}L${n(cx)} ${n(top)}L${n(cx + w / 2)} ${n(shoulder)}V${n(y0)}Z`,
      M.steel,
    ) +
    shape(
      `M${n(cx)} ${n(top + 1)}L${n(cx + w / 2 - 0.7)} ${n(shoulder)}V${n(y0 - 0.7)}H${n(cx)}Z`,
      M.steelDark,
      0,
    ) +
    streak(
      `M${n(cx - w / 2 + 1.2)} ${n(y0 - 1)}V${n(shoulder)}L${n(cx)} ${n(top + 1.5)}`,
      M.steelLight,
      1.2,
    ) +
    streak(`M${n(cx)} ${n(y0 - 3)}V${n(shoulder + 4)}`, M.edge, 1)
  );
};

/**
 * One drawing per held item: its width, and its body on a `width` x `length` box.
 * @type {Readonly<Record<keyof typeof HELD, (length: number) => [number, string]>>}
 */
const HELD_DRAWINGS = {
  sword: (/** @type {number} */ L) => {
    const w = 38,
      c = w / 2;
    return [
      w,
      knob(c, L - 5, 4.6) +
        wrap(c, 6.5, L - 34, L - 9) +
        shape(
          `M${n(c - 17)} ${n(L - 40)}H${n(c + 17)}L${n(c + 15)} ${n(L - 34)}H${n(c - 15)}Z`,
          M.brass,
        ) +
        streak(`M${n(c - 15)} ${n(L - 38.5)}H${n(c + 15)}`, M.brassDark, 1) +
        blade(c, 10, L - 40, 2),
    ];
  },
  axe: (/** @type {number} */ L) => {
    const w = 80,
      c = w / 2;
    // The bit inward (right), over the arm, a short beak behind it.
    return [
      w,
      shaft(c, 7, 6, L - 2) +
        wrap(c, 8, L - 32, L - 6) +
        knob(c, L - 3, 3.6, M.steelDark) +
        shape(
          `M${n(c + 3)} 14L${n(c + 18)} 10Q${n(c + 36)} 4 ${n(c + 38)} 2Q${n(c + 31)} 22 ${n(c + 38)} 46Q${n(c + 34)} 40 ${n(c + 18)} 36L${n(c + 3)} 32Z`,
          M.steel,
        ) +
        streak(`M${n(c + 36)} 6Q${n(c + 29)} 24 ${n(c + 36)} 42`, M.steelLight, 1.6) +
        shape(`M${n(c - 3)} 16L${n(c - 14)} 22L${n(c - 3)} 30Z`, M.steelDark) +
        shape(bar(c, 10, 12, 36), M.steelDark, 1.2),
    ];
  },
  hammer: (/** @type {number} */ L) => {
    const w = 52,
      c = w / 2;
    return [
      w,
      shaft(c, 8, 26, L - 2) +
        wrap(c, 9, L - 34, L - 6) +
        knob(c, L - 3, 4, M.steelDark) +
        shape(`M2 6H${n(w - 2)}V34H2Z`, M.steel) +
        shape(`M${n(w / 2)} 7H${n(w - 3)}V33H${n(w / 2)}Z`, M.steelDark, 0) +
        streak("M4 9V31", M.steelLight, 1.6) +
        shape(bar(c, 14, 2, 38), M.brass, 1.2) +
        streak(`M${n(c - 4)} 5V35`, "#e6c878", 1.4),
    ];
  },
  daggers: (/** @type {number} */ L) => {
    const w = 18,
      c = w / 2;
    return [
      w,
      knob(c, L - 3, 3) +
        wrap(c, 5, L - 16, L - 5, 3) +
        shape(
          `M${n(c - 8)} ${n(L - 20)}H${n(c + 8)}L${n(c + 6)} ${n(L - 16)}H${n(c - 6)}Z`,
          M.brass,
          1.1,
        ) +
        blade(c, 7, L - 20, 1),
    ];
  },
  scythe: (/** @type {number} */ L) => {
    const w = 140,
      c = w / 2;
    // The snath upright, the blade sweeping inward (right) from its top,
    // over the shoulder, so the figure's box holds it.
    return [
      w,
      shaft(c, 7, 4, L - 2) +
        wrap(c, 9, L - 112, L - 96, 3) +
        wrap(c, 9, L - 30, L - 14, 3) +
        shape(
          `M${n(c + 2)} 4Q${n(c + 44)} -2 ${n(c + 64)} 26Q${n(c + 44)} 10 ${n(c + 2)} 18Z`,
          M.steel,
        ) +
        streak(`M${n(c + 6)} 7Q${n(c + 42)} 3 ${n(c + 60)} 23`, M.steelLight, 1.4) +
        shape(bar(c, 11, 2, 20), M.steelDark, 1.2),
    ];
  },
  spear: (/** @type {number} */ L) => {
    const w = 22,
      c = w / 2;
    return [
      w,
      shaft(c, 6, 46, L - 8) +
        wrap(c, 7.5, L - 132, L - 100, 4) +
        shape(`M${n(c - 3)} ${n(L - 9)}H${n(c + 3)}L${n(c)} ${n(L - 1)}Z`, M.steelDark, 1.1) +
        shape(bar(c, 8, 44, 54), M.brass, 1.1) +
        shape(
          `M${n(c)} 2Q${n(c + 11)} 26 ${n(c + 3)} 46H${n(c - 3)}Q${n(c - 11)} 26 ${n(c)} 2Z`,
          M.steel,
        ) +
        shape(`M${n(c)} 4Q${n(c + 10)} 26 ${n(c + 3)} 45H${n(c)}Z`, M.steelDark, 0) +
        streak(`M${n(c)} 6V43`, M.edge, 0.9),
    ];
  },
  wand: (/** @type {number} */ L) => {
    const w = 16,
      c = w / 2;
    return [
      w,
      shape(
        `M${n(c - 3.4)} ${n(L - 2)}L${n(c - 2)} 12H${n(c + 2)}L${n(c + 3.4)} ${n(L - 2)}Z`,
        M.wood,
        1.2,
      ) +
        streak(`M${n(c + 1.6)} 14L${n(c + 2.4)} ${n(L - 4)}`, M.woodDark, 1.2) +
        wrap(c, 7.5, L - 16, L - 4, 3) +
        shape(bar(c, 7, 10, 15), M.brass, 1) +
        knob(c, 6.5, 5.6, M.gem),
    ];
  },
  staff: (/** @type {number} */ L) => {
    const w = 36,
      c = w / 2;
    // A shaft with an orb held in a split crook.
    return [
      w,
      shaft(c, 8, 34, L - 3) +
        wrap(c, 10, L - 150, L - 112, 5) +
        shape(bar(c, 10, L - 20, L - 4), M.brass, 1.1) +
        streak(
          `M${n(c - 2)} 36Q${n(c - 15)} 28 ${n(c - 12)} 8M${n(c + 2)} 36Q${n(c + 15)} 28 ${n(c + 12)} 8`,
          M.woodDark,
          5,
        ) +
        knob(c, 19, 9, M.gem) +
        `<circle cx="${n(c)}" cy="19" r="13" fill="${M.gem}" opacity=".18"/>`,
    ];
  },
  shortbow: (/** @type {number} */ L) => bow(L, "plain"),
  "recurve-bow": (/** @type {number} */ L) => bow(L, "recurve"),
  hornbow: (/** @type {number} */ L) => bow(L, "horn"),
  flatbow: (/** @type {number} */ L) => bow(L, "flat"),
  longbow: (/** @type {number} */ L) => bow(L, "long"),
  shield: (/** @type {number} */ L) => {
    // Drawn a little inward of the grip, so its outer rim stays by the figure.
    const w = 96,
      c = w / 2;
    const outline = `M4 6Q${n(c)} -2 ${n(w - 4)} 6V${n(L * 0.45)}Q${n(w - 8)} ${n(L * 0.82)} ${n(c)} ${n(L - 3)}Q8 ${n(L * 0.82)} 4 ${n(L * 0.45)}Z`;
    const inner = `M12 12Q${n(c)} 5 ${n(w - 12)} 12V${n(L * 0.45)}Q${n(w - 15)} ${n(L * 0.77)} ${n(c)} ${n(L - 13)}Q15 ${n(L * 0.77)} 12 ${n(L * 0.45)}Z`;
    return [
      w + 24,
      `<g transform="translate(4,0)">` +
        shape(outline, M.steelDark, 1.6) +
        shape(inner, M.wood, 1.2) +
        shape(
          `M${n(c)} 9V${n(L - 13)}Q${n(w - 15)} ${n(L * 0.77)} ${n(w - 12)} ${n(L * 0.45)}V12Q${n(c + 20)} 7 ${n(c)} 9Z`,
          M.woodDark,
          0,
        ) +
        streak(`M7 9V${n(L * 0.45)}Q10 ${n(L * 0.78)} ${n(c - 4)} ${n(L - 6)}`, M.steelLight, 1.6) +
        streak(`M${n(c)} 10V${n(L - 14)}M14 ${n(L * 0.4)}H${n(w - 14)}`, M.brassDark, 4) +
        knob(c, L * 0.4, 11) +
        "</g>",
    ];
  },
  focus: (/** @type {number} */ L) => {
    const w = 46,
      c = w / 2;
    return [
      w,
      `<circle cx="${n(c)}" cy="${n(L / 2)}" r="22" fill="${M.gem}" opacity=".2"/>` +
        shape(
          `M${n(c)} 6L${n(c + 12)} ${n(L / 2)}L${n(c)} ${n(L - 6)}L${n(c - 12)} ${n(L / 2)}Z`,
          M.gem,
          1.3,
        ) +
        shape(`M${n(c)} 7L${n(c + 11)} ${n(L / 2)}L${n(c)} ${n(L - 7)}Z`, "#5f6fd0", 0) +
        streak(`M${n(c - 2)} 11L${n(c - 9)} ${n(L / 2)}`, M.gemLight, 1.6) +
        shape(`M${n(c - 9)} ${n(L - 13)}Q${n(c)} ${n(L - 4)} ${n(c + 9)} ${n(L - 13)}`, "none", 0) +
        streak(
          `M${n(c - 10)} ${n(L - 12)}Q${n(c)} ${n(L - 2)} ${n(c + 10)} ${n(L - 12)}`,
          M.brass,
          2.6,
        ),
    ];
  },
};

/**
 * A bow upright in the left hand of the drawing, by the middle: its back
 * outward (left), the string straight on the right.
 * @param {number} L @param {"plain" | "recurve" | "horn" | "flat" | "long"} kind
 * @returns {[number, string]}
 */
function bow(L, kind) {
  const depth = kind === "long" ? 0.14 : kind === "flat" ? 0.13 : 0.18;
  const w = Math.round(L * depth) + 12;
  const string = w - 4;
  const mid = L / 2;
  const back = 4;
  const tip = string - 2;
  const limb =
    kind === "flat"
      ? `M${n(tip)} 3L${n(back + 4)} ${n(mid - 18)}L${n(back)} ${n(mid)}L${n(back + 4)} ${n(mid + 18)}L${n(tip)} ${n(L - 3)}`
      : kind === "recurve" || kind === "horn"
        ? `M${n(tip - 8)} 3Q${n(tip + 2)} 14 ${n(tip - 10)} 22Q${n(back - 4)} ${n(mid - 40)} ${n(back)} ${n(mid)}Q${n(back - 4)} ${n(mid + 40)} ${n(tip - 10)} ${n(L - 22)}Q${n(tip + 2)} ${n(L - 14)} ${n(tip - 8)} ${n(L - 3)}`
        : `M${n(tip)} 3Q${n(back - 6)} ${n(mid)} ${n(tip)} ${n(L - 3)}`;
  const stringTop = kind === "recurve" || kind === "horn" ? 22 : 3;
  const tone = kind === "horn" ? M.horn : M.wood;
  const dark = kind === "horn" ? M.hornDark : M.woodDark;
  // The grip is the drawing's centre: the box runs as far left of it as the
  // string is to its right.
  const grip = back + 2;
  const width = 2 * (w - grip);
  return [
    width,
    `<g transform="translate(${n(width / 2 - grip)},0)">` +
      streak(`M${n(string)} ${n(stringTop)}V${n(L - stringTop)}`, M.steelLight, 1) +
      streak(limb, M.edge, 9.4) +
      streak(limb, tone, 7) +
      streak(limb, dark, 1.4) +
      wrap(grip, 9, mid - 13, mid + 13, 4) +
      "</g>",
  ];
}

/** The held drawings of `HELD`, by id: upright, `length` tall, the grip at the bottom-centre of its fraction. */
export function heldItems() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [id, pose] of Object.entries(HELD)) {
    const [width, body] = HELD_DRAWINGS[/** @type {keyof typeof HELD} */ (id)](pose.length);
    out[id] =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(pose.length)}" width="${String(width)}" height="${String(pose.length)}">${body}</svg>\n`;
  }
  return out;
}
