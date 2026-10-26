// Generates every VibeWars icon as a small, flat SVG.
//
//   node scripts/assets/icons.mjs
//
// Writes apps/web/public/icons/<family>/<name>.svg. The output is committed;
// re-run this after changing anything here and commit both. The palette and
// the shape rules are written down in docs/art/art-direction.md. Change them
// there first, then here.
//
// Every icon is drawn on a 24x24 grid with whole-pixel strokes so it stays
// sharp at 16, 24 and 48 px. Colours are baked in rather than left to
// `currentColor`, because Phaser rasterises an SVG texture with no CSS
// context.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { WEAPON_MARK_GEOMETRY } from "../../apps/web/src/render/weapon-mark-geometry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "apps", "web", "public", "icons");

/** The palette. Mirrors the tokens table in docs/art/art-direction.md. */
const C = {
  bg: "#0e1116",
  plate: "#161b22",
  line: "#2b3440",
  ink: "#d7dee8",
  condition: "#ffa657",
  hex: "#d2a8ff",
  enchantment: "#56d4dd",
  stance: "#f778ba",
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

/** @param {string} body */
const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${body}</svg>\n`;

/**
 * @param {string} colour
 * @param {number} [width]
 */
const stroke = (colour, width = 2) =>
  `fill="none" stroke="${colour}" stroke-width="${String(width)}" stroke-linecap="round" stroke-linejoin="round"`;

// ---------------------------------------------------------------------------
// Professions: one silhouette each, distinct with the colour removed.
// Coloured in menus, the build editor and the target panel. In the arena,
// where colour means team, the scene tints them flat `ink` (#281), so every
// cut is a transparent hole (fill-rule evenodd), never a painted plate
// colour, which a tint fill would paint over.
// ---------------------------------------------------------------------------

const profession = {
  // Shield: pentagon, flat top.
  warrior: () => `<path d="M4 4h16v7c0 5-4 8-8 10-4-2-8-5-8-10z" fill="${C.warrior}"/>`,
  // Arrow in flight, pointing up-right.
  ranger: () =>
    `<path d="M5 19L18 6" ${stroke(C.ranger, 3)}/>` + `<path d="M11 4h9v9z" fill="${C.ranger}"/>`,
  // Plus: the healer reads as the healer.
  monk: () => `<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="${C.monk}"/>`,
  // Downward triangle with a hollow eye: the hexer, pointing at the ground.
  necromancer: () =>
    `<path d="M3 4h18L12 21zM9.5 9.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0z" fill="${C.necromancer}" fill-rule="evenodd"/>`,
  // Hourglass: time, echoes, interrupts.
  mesmer: () => `<path d="M5 3h14l-5.5 9L19 21H5l5.5-9z" fill="${C.mesmer}"/>`,
  // Diamond, split: four elements.
  // The split is a plus-shaped hole, 2 wide, with round ends at 5 and 19.
  elementalist: () =>
    `<path d="M12 2l10 10-10 10L2 12zM11 6a1 1 0 0 1 2 0v5h5a1 1 0 0 1 0 2h-5v5a1 1 0 0 1-2 0v-5H6a1 1 0 0 1 0-2h5z" fill="${C.elementalist}" fill-rule="evenodd"/>`,
  // Crescent moon: strikes from the shadows.
  assassin: () =>
    `<path d="M11.4 2.5A9.5 9.5 0 1 0 21.3 13.7 7.5 7.5 0 0 1 11.4 2.5z" fill="${C.assassin}"/>`,
  // Spirit urn: a flared rim, a narrow neck, a round body.
  ritualist: () =>
    `<path d="M8 3h8v2l-2 2.5c3.5 1.2 5.5 4 5.5 7.5 0 4-3.3 6-7.5 6s-7.5-2-7.5-6c0-3.5 2-6.3 5.5-7.5L8 5z" fill="${C.ritualist}"/>`,
  // Two rank chevrons: the one who leads.
  paragon: () =>
    `<path d="M3 11l9-8 9 8v4.5l-9-8-9 8zM3 18.5l9-8 9 8V23l-9-8-9 8z" fill="${C.paragon}"/>`,
  // Three curved blades turning: the whirling scythe.
  dervish: () =>
    `<g fill="${C.dervish}">` +
    [0, 120, 240]
      .map(
        (deg) =>
          `<path d="M12 12C10 7 12.5 3 18.5 1.5c-1 3.5-1.5 7.5-3.5 11z" transform="rotate(${String(deg)} 12 12)"/>`,
      )
      .join("") +
    `<circle cx="12" cy="12" r="2.5"/></g>`,
};

// ---------------------------------------------------------------------------
// Skill types: the corner badge on a skill slot. Ink on the slot, so the
// category is a shape, not a colour; hex and enchantment also carry their
// status colour because the same skill puts that marker on its target.
// ---------------------------------------------------------------------------

const skillType = {
  // A blade: one hard diagonal with a crossguard.
  attack: () => `<path d="M5 19L19 5M8 13l3 3M4 20l2-2" ${stroke(C.ink, 2.5)}/>`,
  // Four-point star: magic.
  spell: () =>
    `<path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z" fill="${C.ink}"/>`,
  // Solid ring: something good stays on you (brief §20: enchantment = ring).
  enchantment: () => `<circle cx="12" cy="12" r="8" ${stroke(C.enchantment, 3)}/>`,
  // Broken ring: something bad stays on you (brief §20: hex = ring/marker).
  hex: () => `<circle cx="12" cy="12" r="8" ${stroke(C.hex, 3)} stroke-dasharray="6 4.566"/>`,
  // Pentagon ring, point up: a posture you hold. Solid like the enchantment
  // ring, but five-sided, so the two never merge at 16 px.
  stance: () => `<path d="M12 3.5l8 6-3 10H7l-3-10z" ${stroke(C.stance, 3)}/>`,
  // Plain square: a skill with no other type.
  skill: () => `<rect x="6" y="6" width="12" height="12" rx="1" fill="${C.ink}"/>`,
};

// ---------------------------------------------------------------------------
// Statuses: the markers under an actor in the arena. The plate gives the
// category by colour *and* outline (condition = circle, hex = diamond,
// enchantment = rounded square, stance = pentagon), and the glyph gives the status.
// ---------------------------------------------------------------------------

/** @typedef {(colour: string) => string} Glyph */
/** @typedef {"condition" | "hex" | "enchantment" | "stance"} Category */

/** @type {Record<Category, (glyph: Glyph) => string>} */
const plates = {
  stance: (glyph) =>
    `<path d="M12 1L23 9l-4 14H5L1 9z" fill="${C.stance}" stroke="${C.stance}" stroke-width="1" stroke-linejoin="round"/>` +
    glyph(C.plate),
  condition: (glyph) => `<circle cx="12" cy="12" r="11" fill="${C.condition}"/>` + glyph(C.plate),
  hex: (glyph) => `<path d="M12 0.5L23.5 12 12 23.5 0.5 12z" fill="${C.hex}"/>` + glyph(C.plate),
  enchantment: (glyph) =>
    `<rect x="1" y="1" width="22" height="22" rx="5" fill="${C.enchantment}"/>` + glyph(C.plate),
};

/** @type {Record<string, [Category, Glyph]>} */
const status = {
  // Drop.
  bleeding: [
    "condition",
    (c) => `<path d="M12 4c3 4.5 5 7 5 9.5a5 5 0 0 1-10 0C7 11 9 8.5 12 4z" fill="${c}"/>`,
  ],
  // Flame: one tall tip leaning right and a side tongue, so it never reads
  // as the symmetric bleeding drop.
  burning: [
    "condition",
    (c) =>
      `<path d="M14 3.5c.5 3.5 4 5.5 4 10a6 6 0 0 1-12 0c0-2.5 1-4.5 2.5-5.5 0 2 .5 3 1.5 3.5-.5-3 1-6 4-8z" fill="${c}"/>`,
  ],
  // Three bubbles.
  poison: [
    "condition",
    (c) =>
      `<circle cx="9" cy="14.5" r="3" fill="${c}"/>` +
      `<circle cx="15.5" cy="13" r="2.2" fill="${c}"/>` +
      `<circle cx="12" cy="7.5" r="1.8" fill="${c}"/>`,
  ],
  // Broken step: a line that kinks and drops.
  crippled: ["condition", (c) => `<path d="M5 9h6l2 6h6" ${stroke(c, 2.5)}/>`],
  // Eye, struck through.
  blind: [
    "condition",
    (c) =>
      `<path d="M4.5 12c2-3.5 4.5-5 7.5-5s5.5 1.5 7.5 5c-2 3.5-4.5 5-7.5 5s-5.5-1.5-7.5-5z" ${stroke(c, 2)}/>` +
      `<path d="M6 18L18 6" ${stroke(c, 2.5)}/>`,
  ],
  // Arrow down: you hit softer.
  weakness: ["condition", (c) => `<path d="M12 5v13M7 13l5 5 5-5" ${stroke(c, 2.5)}/>`],
  // Cross cut.
  "deep-wound": ["condition", (c) => `<path d="M7 7l10 10M17 7L7 17" ${stroke(c, 3)}/>`],
  // Five-point star: seeing stars.
  dazed: [
    "condition",
    (c) =>
      `<path d="M12 4.5l2.2 4.6 5 .6-3.7 3.5 1 5L12 15.8l-4.5 2.4 1-5-3.7-3.5 5-.6z" fill="${c}"/>`,
  ],
  // Hex: a heart, because the hex is on your life.
  "life-drain": [
    "hex",
    (c) => `<path d="M12 16l-3.6-3.6a2.1 2.1 0 0 1 3.6-3 2.1 2.1 0 0 1 3.6 3z" fill="${c}"/>`,
  ],
  // Enchantment: plus, health coming back.
  regeneration: ["enchantment", (c) => `<path d="M12 6v12M6 12h12" ${stroke(c, 3)}/>`],
  // Stance: two chevrons, forward: move 25% faster.
  sprint: ["stance", (c) => `<path d="M7 9l4.5 5L7 19M12.5 9l4.5 5-4.5 5" ${stroke(c, 2.5)}/>`],
  // Stance: an arrowhead trailing speed lines: run 50% faster.
  dash: [
    "stance",
    (c) =>
      `<path d="M20 14l-7-5v10z" fill="${c}"/>` +
      `<path d="M5 11h5M5 17h5M3.5 14h7" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a small shield.
  "armor-boost": [
    "enchantment",
    (c) => `<path d="M7 6h10v5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" fill="${c}"/>`,
  ],
  // Enchantment: a drop with a plus cut out, blood paying for energy (#503).
  "blood-ritual": [
    "enchantment",
    (c) =>
      `<path fill-rule="evenodd" d="M12 4.5C14.5 8 17 10.5 17 14a5 5 0 0 1-10 0c0-3.5 2.5-6 5-9.5zM11 11.5h2v2.5h2.5v2H13v2.5h-2V16H8.5v-2H11z" fill="${c}"/>`,
  ],
  // Hex: a bolt in outline, the energy draining out (#503).
  malaise: ["hex", (c) => `<path d="M13 4.5L7.5 13h4l-1 6.5L16.5 11h-4z" ${stroke(c, 2)}/>`],
  // Enchantment: a shield in outline with a blow glancing off it, block (#534).
  guardian: [
    "enchantment",
    (c) =>
      `<path d="M7 5.5h10v5.5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" ${stroke(c, 2)} stroke-linejoin="round"/>` +
      `<path d="M9.5 14L15 8.5" ${stroke(c, 2.2)} stroke-linecap="round"/>`,
  ],
};

// ---------------------------------------------------------------------------
// UI: controls in the HUD and menus. Ink on the panel. The two states of one
// control differ by shape, never by colour alone.
// ---------------------------------------------------------------------------

/** The speaker both sound icons share: a box and a flared cone. */
const speaker = `<path d="M3 9h4l5-5v16l-5-5H3z" fill="${C.ink}"/>`;

/** The beamed eighth notes both music icons share: two heads, two stems, a slab beam, one fill. */
const notes = `<path d="M8.5 18V6L19.5 4v12h-2V7.5l-7 1.5v9zM3 18a3 2 0 1 1 6 0 3 2 0 1 1-6 0M14 16a3 2 0 1 1 6 0 3 2 0 1 1-6 0" fill="${C.ink}"/>`;

const ui = {
  // Speaker with two sound waves: sound is on (#112).
  "sound-on": () =>
    speaker + `<path d="M15.5 9a4 4 0 0 1 0 6M18.5 6a8 8 0 0 1 0 12" ${stroke(C.ink, 2)}/>`,
  // Speaker with a cross where the waves were: muted (#112).
  "sound-off": () => speaker + `<path d="M15.5 9l6 6M21.5 9l-6 6" ${stroke(C.ink, 2)}/>`,
  // Beamed eighth notes: music is on (#372).
  "music-on": () => notes,
  // The same notes under a slash cased in the background: music is muted (#372).
  "music-off": () =>
    notes + `<path d="M4 4l16 16" ${stroke(C.bg, 4)}/><path d="M4 4l16 16" ${stroke(C.ink, 2)}/>`,
  // Two crossed swords, tips up, guards and grips low: you are auto-attacking
  // (#160). Two blades, so it never reads as the one-sword attack skill type.
  attacking: () =>
    `<path d="M4 4l13 13M20 4L7 17M14 20l6-6M10 20l-6-6M17 17l3.5 3.5M7 17l-3.5 3.5" ${stroke(C.ink, 2)}/>`,
};

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Projectiles: ranged weapon shots in flight (#161). Not icons: sprites on a
// 32x12 grid, pointing along +x, so the scene rotates them to the heading.
// White under a `bg` outline, because the scene tints each one to the
// shooter's team colour: the tint gives the team, the silhouette the weapon.
// One path each, outline painted under the fill, so overlapping parts merge.
// ---------------------------------------------------------------------------

/** @param {string} d */
const projectileSprite = (d) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 12" width="32" height="12">` +
  `<path d="${d}" fill="#fff" stroke="${C.bg}" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke"/></svg>\n`;

const projectile = {
  // Arrow (bows): thin shaft, triangular head, chevron fletching.
  arrow: "M6 5h17v2H6zM22 2l8 4-8 4zM2 2h3l4 4-4 4H2l3-4z",
  // Spear: thicker shaft, a long leaf blade, no fletching.
  spear: "M2 4.75h18v2.5H2zM17 6l5-4L31 6l-9 4z",
  // Bolt (wand and staff): a bright orb with a tapering comet tail.
  bolt: "M2 6l20-3.5v7zM24.5 6m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0",
};

// ---------------------------------------------------------------------------
// Weapons and off-hands (#419): the arena's marks (#188, #418, #275) turned to
// point up and fitted to the grid, so what a picker shows is what you spot in
// the fight. The weapon geometry is imported as it is, from the module the
// arena draws it with. The off-hand numbers are copied from `offhandMarkLayout`
// in apps/web/src/render/arena-snapshot.ts (it imports game-core, so a script
// cannot load it): keep them in step. No body disc. Strokes keep one weight
// whatever the scale: a core of 2 units is 2.3 px at 28 px display.
// ---------------------------------------------------------------------------

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ pts: Pt[], casing: number, core: number, closed: boolean, fill: boolean }} Shape */

const EDGE = "#0b0f14";
const CASING = 3.6;
const CORE = 2;
const STRING_CASING = 2.6;
const STRING_CORE = 1;
const GRID = 24;
const MARGIN = 1;

/**
 * Body frame (+x facing, +y right hand) to icon frame, facing up.
 * @param {Pt} q
 * @returns {Pt}
 */
const turnUp = (q) => ({ x: q.y, y: -q.x });

/**
 * Fit shapes into the grid: uniform scale, centred, never enlarging past
 * `maxScale`. Stroke widths are given in final units and are not scaled,
 * except in `scaleStrokes` mode (the off-hands, whose widths are part of the
 * shape).
 * @param {Shape[]} shapes in the body frame
 * @param {{ maxScale?: number, scaleStrokes?: boolean }} [options]
 */
function fitIcon(shapes, options = {}) {
  const { maxScale = 1.6, scaleStrokes = false } = options;
  const turned = shapes.map((s) => ({ ...s, pts: s.pts.map(turnUp) }));
  const all = turned.flatMap((s) => s.pts);
  const minX = Math.min(...all.map((q) => q.x));
  const maxX = Math.max(...all.map((q) => q.x));
  const minY = Math.min(...all.map((q) => q.y));
  const maxY = Math.max(...all.map((q) => q.y));
  const widest = Math.max(...shapes.map((s) => s.casing));
  const w = maxX - minX;
  const h = maxY - minY;
  // With scaled strokes the casing grows with the scale: solve for it.
  const avail = GRID - 2 * MARGIN;
  const scale = scaleStrokes
    ? Math.min(maxScale, avail / (Math.max(w, h) + widest))
    : Math.min(maxScale, (avail - widest) / Math.max(w, h));
  const mul = scaleStrokes ? scale : 1;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  /** @param {Pt} q */
  const place = (q) =>
    `${String(Math.round((GRID / 2 + (q.x - cx) * scale) * 100) / 100)} ${String(Math.round((GRID / 2 + (q.y - cy) * scale) * 100) / 100)}`;
  /** @param {number} n */
  const width = (n) => String(Math.round(n * mul * 100) / 100);
  /** @param {Shape} s */
  const d = (s) => `M${s.pts.map(place).join("L")}${s.closed ? "z" : ""}`;
  const casings = turned
    .map(
      (s) =>
        `<path d="${d(s)}" fill="none" stroke="${EDGE}" stroke-width="${width(s.casing)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  const cores = turned
    .map((s) =>
      s.fill
        ? `<path d="${d(s)}" fill="${C.ink}"/>`
        : `<path d="${d(s)}" fill="none" stroke="${C.ink}" stroke-width="${width(s.core)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  return svg(casings + cores);
}

/** @type {Record<string, Shape[]>} */
const weaponShapes = Object.fromEntries(
  Object.entries(WEAPON_MARK_GEOMETRY).map(([id, g]) => [
    id,
    [
      ...g.strokes.map((pts) => ({
        pts: [...pts],
        casing: CASING,
        core: CORE,
        closed: false,
        fill: false,
      })),
      // A filled head is cased by a stroke of the same polygon, a little thinner.
      ...g.fills.map((pts) => ({
        pts: [...pts],
        casing: CASING - 1.6,
        core: 0,
        closed: true,
        fill: true,
      })),
      ...g.strings.map((pts) => ({
        pts: [...pts],
        casing: STRING_CASING,
        core: STRING_CORE,
        closed: false,
        fill: false,
      })),
    ],
  ]),
);

/**
 * `n + 1` points of the arc of `radius` about the origin, angles in degrees.
 * @param {number} radius
 * @param {number} from
 * @param {number} to
 * @param {number} n
 * @returns {Pt[]}
 */
const arcPoints = (radius, from, to, n) =>
  Array.from({ length: n + 1 }, (_, k) => {
    const a = ((from + ((to - from) * k) / n) * Math.PI) / 180;
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
  });

/** Body radius, and how far past its edge the off-hand marks sit. */
const BODY_R = 14;
const OFFHAND_REACH = 3.5;

/** @type {Record<string, [Shape[], boolean]>} */
const offhandShapes = {
  // The shield: an arc 105° to 45° left of the facing, casing 5, core 3.
  shield: [
    [
      {
        pts: arcPoints(BODY_R + OFFHAND_REACH, -105, -45, 12),
        casing: 5,
        core: 3,
        closed: false,
        fill: false,
      },
    ],
    true,
  ],
  // The focus: a ring of radius 1.75, casing 3, core 1.5; scaled up, but drawn in
  // the family weight, or its hole closes.
  focus: [
    [
      {
        pts: arcPoints(1.75, 0, 360, 24).slice(0, 24),
        casing: CASING,
        core: CORE,
        closed: true,
        fill: false,
      },
    ],
    false,
  ],
};

/** @type {Record<string, Record<string, string>>} */
const families = {
  profession: Object.fromEntries(Object.entries(profession).map(([k, f]) => [k, svg(f())])),
  "skill-type": Object.fromEntries(Object.entries(skillType).map(([k, f]) => [k, svg(f())])),
  weapon: Object.fromEntries(Object.entries(weaponShapes).map(([k, s]) => [k, fitIcon(s)])),
  offhand: Object.fromEntries(
    Object.entries(offhandShapes).map(([k, [s, scaled]]) => [
      k,
      fitIcon(s, { maxScale: 3, scaleStrokes: scaled }),
    ]),
  ),
  ui: Object.fromEntries(Object.entries(ui).map(([k, f]) => [k, svg(f())])),
  projectile: Object.fromEntries(
    Object.entries(projectile).map(([k, d]) => [k, projectileSprite(d)]),
  ),
  status: Object.fromEntries(
    Object.entries(status).map(([k, [category, glyph]]) => [k, svg(plates[category](glyph))]),
  ),
};

let total = 0;
for (const [family, icons] of Object.entries(families)) {
  const dir = join(outDir, family);
  // Discard what an earlier run wrote, so a renamed icon leaves no orphan.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(icons)) {
    writeFileSync(join(dir, `${name}.svg`), content);
    total += Buffer.byteLength(content);
  }
  console.log(`${family}: ${String(readdirSync(dir).length)} icons`);
}
console.log(`total: ${String(total)} bytes`);
