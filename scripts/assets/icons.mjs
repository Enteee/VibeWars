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
// Used in menus, the build editor and the target panel, never in the arena,
// where colour means team.
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
    `<path d="M3 4h18L12 21z" fill="${C.necromancer}"/>` +
    `<circle cx="12" cy="9.5" r="2.5" fill="${C.plate}"/>`,
  // Hourglass: time, echoes, interrupts.
  mesmer: () => `<path d="M5 3h14l-5.5 9L19 21H5l5.5-9z" fill="${C.mesmer}"/>`,
  // Diamond, split: four elements.
  elementalist: () =>
    `<path d="M12 2l10 10-10 10L2 12z" fill="${C.elementalist}"/>` +
    `<path d="M12 6v12M6 12h12" ${stroke(C.plate, 2)}/>`,
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
  // Plain square: a skill with no other type.
  skill: () => `<rect x="6" y="6" width="12" height="12" rx="1" fill="${C.ink}"/>`,
};

// ---------------------------------------------------------------------------
// Statuses: the markers under an actor in the arena. The plate gives the
// category by colour *and* outline (condition = circle, hex = diamond,
// enchantment = rounded square), and the glyph gives the status.
// ---------------------------------------------------------------------------

/** @typedef {(colour: string) => string} Glyph */
/** @typedef {"condition" | "hex" | "enchantment"} Category */

/** @type {Record<Category, (glyph: Glyph) => string>} */
const plates = {
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
  // Enchantment: a small shield.
  "armor-boost": [
    "enchantment",
    (c) => `<path d="M7 6h10v5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" fill="${c}"/>`,
  ],
};

// ---------------------------------------------------------------------------
// UI: controls in the HUD and menus. Ink on the panel. The two states of one
// control differ by shape, never by colour alone.
// ---------------------------------------------------------------------------

/** The speaker both sound icons share: a box and a flared cone. */
const speaker = `<path d="M3 9h4l5-5v16l-5-5H3z" fill="${C.ink}"/>`;

const ui = {
  // Speaker with two sound waves: sound is on (#112).
  "sound-on": () =>
    speaker + `<path d="M15.5 9a4 4 0 0 1 0 6M18.5 6a8 8 0 0 1 0 12" ${stroke(C.ink, 2)}/>`,
  // Speaker with a cross where the waves were: muted (#112).
  "sound-off": () => speaker + `<path d="M15.5 9l6 6M21.5 9l-6 6" ${stroke(C.ink, 2)}/>`,
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

/** @type {Record<string, Record<string, string>>} */
const families = {
  profession: Object.fromEntries(Object.entries(profession).map(([k, f]) => [k, svg(f())])),
  "skill-type": Object.fromEntries(Object.entries(skillType).map(([k, f]) => [k, svg(f())])),
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
