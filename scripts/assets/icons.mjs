// Generates every VibeWars icon as a small, flat SVG.
//
//   node scripts/assets/icons.mjs
//   node scripts/assets/icons.mjs --vocabulary   (prints the glyphs and what each means)
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

import { C, stroke } from "./icon-kit.mjs";
import { STATUS_ICONS } from "./status-icon-table.mjs";
import { SKILL_ICONS } from "./skill-icon-table.mjs";
import { GLYPHS, MODIFIERS } from "./glyph-table.mjs";
import { gearIcons, paperDollFigure } from "./gear-icons.mjs";
import { WEAPON_MARK_GEOMETRY } from "../../apps/web/src/render/weapon-mark-geometry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// The stale-output test in apps/web runs this into a scratch directory.
const outDir = process.env.VIBEWARS_ICONS_OUT ?? join(root, "apps", "web", "public", "icons");

/** @param {string} body */
const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${body}</svg>\n`;

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
  // Signet ring: a band with its seal on top (#524).
  signet: () =>
    `<circle cx="12" cy="14" r="6" ${stroke(C.ink, 2.5)}/>` +
    `<path d="M12 2.5l3.5 3.5-3.5 3.5-3.5-3.5z" fill="${C.ink}"/>`,
  // A mouth and two sound waves: a shout carries (#524).
  shout: () =>
    `<circle cx="6" cy="12" r="2.5" fill="${C.ink}"/>` +
    `<path d="M11 8a5.5 5.5 0 0 1 0 8M15 4.5a10 10 0 0 1 0 15" ${stroke(C.ink, 2.5)}/>`,
  // Pentagon ring, point up: a posture you hold. Solid like the enchantment
  // ring, but five-sided, so the two never merge at 16 px.
  stance: () => `<path d="M12 3.5l8 6-3 10H7l-3-10z" ${stroke(C.stance, 3)}/>`,
  // Triangle ring, point up: your attacks are readied (#525).
  preparation: () => `<path d="M12 3.5L21 20H3z" ${stroke(C.preparation, 3)}/>`,
  // Triangle ring, point down: your next spells are readied (#526).
  glyph: () => `<path d="M12 20.5L21 4H3z" ${stroke(C.glyph, 3)}/>`,
  // A note: a chant is sung to the party (#758).
  chant: () =>
    `<circle cx="8" cy="17.5" r="3.5" fill="${C.ink}"/>` +
    `<path d="M10.5 17.5V3.5c2.5.5 6.5 2.5 6.5 7" ${stroke(C.ink, 2.5)}/>`,
  // A note and its answer: an echo repeats a chant, so the chant's note with ripples after it (#1482).
  echo: () =>
    `<circle cx="6.5" cy="17.5" r="3.2" fill="${C.ink}"/>` +
    `<path d="M9.2 17.5V4.5" ${stroke(C.ink, 2.4)}/>` +
    `<path d="M13 8.5a5 5 0 0 1 0 7M16.5 6a9 9 0 0 1 0 12" ${stroke(C.ink, 2)}/>`,
  // Shield ring: a spell held on an ally's weapon, one at a time (#758).
  "weapon-spell": () =>
    `<path d="M4.5 3.5h15v7c0 4.5-3.5 7.5-7.5 9.5-4-2-7.5-5-7.5-9.5z" ${stroke(C.weaponSpell, 3)}/>`,
  // A sprout, two leaves on a stem: a nature ritual plants a spirit that
  // reaches everyone near it (#1064).
  "nature-ritual": () =>
    `<path d="M12 21V10" ${stroke(C.ink, 2.5)}/>` +
    `<path d="M12 12C12 7 9 4 4 4c0 5 3 8 8 8zM12 15c0-4 3-7 8-7 0 4-3 7-8 7z" fill="${C.ink}"/>`,
  // An urn on a base line: a binding ritual binds a spirit to its side (#1064).
  "binding-ritual": () =>
    `<path d="M9 3h6v2l-1.5 2c2.5 1 4 3 4 6 0 3-2.5 5-5.5 5s-5.5-2-5.5-5c0-3 1.5-5 4-6L9 5z" fill="${C.ink}"/>` +
    `<path d="M5 21h14" ${stroke(C.ink, 2.5)}/>`,
  // A ring on the ground with a post at its heart: a ward stays where it
  // was cast and reaches whoever stands in it (#1087).
  ward: () =>
    `<ellipse cx="12" cy="16" rx="8.5" ry="4" ${stroke(C.ink, 2.5)}/>` +
    `<path d="M12 16V4" ${stroke(C.ink, 2.5)}/>`,
  // The same ring with an arrow sinking into it: a well is drawn from a
  // corpse and acts on whoever stands in it (#1104).
  well: () =>
    `<ellipse cx="12" cy="16" rx="8.5" ry="4" ${stroke(C.ink, 2.5)}/>` +
    `<path d="M12 3v10M8.5 9.5L12 13l3.5-3.5" ${stroke(C.ink, 2.5)}/>`,
  // An urn: ashes held in the hands (#1434).
  "item-spell": () => `<path d="M8 4h8M9 4v3l-3 4v6l2 3h8l2-3v-6l-3-4V4" ${stroke(C.ink, 2.5)}/>`,
  // Jaws on the ground, teeth up: a trap waits where it was set (#1105).
  trap: () =>
    `<path d="M3 19h18" ${stroke(C.ink, 2.5)}/>` +
    `<path d="M4.5 17L7 8l2.5 9M9.5 17L12 5l2.5 12M14.5 17L17 8l2.5 9" ${stroke(C.ink, 2.2)}/>`,
  // A paw print: the blow is your pet's (#1046).
  "pet-attack": () =>
    `<ellipse cx="12" cy="16" rx="4.5" ry="3.8" fill="${C.ink}"/>` +
    `<circle cx="5.5" cy="10.5" r="2" fill="${C.ink}"/><circle cx="9.5" cy="6.5" r="2" fill="${C.ink}"/>` +
    `<circle cx="14.5" cy="6.5" r="2" fill="${C.ink}"/><circle cx="18.5" cy="10.5" r="2" fill="${C.ink}"/>`,
  // A figure, head over shoulders: a form, you take a god's shape (#1437).
  form: () =>
    `<circle cx="12" cy="7" r="3.5" fill="${C.ink}"/>` +
    `<path d="M5 21c0-5 3-8.5 7-8.5s7 3.5 7 8.5" ${stroke(C.ink, 2.5)}/>`,
  // Plain square: a skill with no other type.
  skill: () => `<rect x="6" y="6" width="12" height="12" rx="1" fill="${C.ink}"/>`,
};

// ---------------------------------------------------------------------------
// Statuses: the markers under an actor in the arena. The plate gives the
// category by colour *and* outline (condition = circle, hex = diamond,
// enchantment = rounded square, stance = pentagon, preparation = triangle
// point up, glyph = triangle point down, shout = hexagon, chant = banner,
// weapon spell = shield, form = octagon, skill effect = wide capsule), and the glyph gives
// the status.
// ---------------------------------------------------------------------------

/** @typedef {import("./icon-kit.mjs").Glyph} Glyph */
/** @typedef {import("./icon-kit.mjs").Category} Category */

/** @type {Record<Category, (glyph: Glyph) => string>} */
const plates = {
  stance: (glyph) =>
    `<path d="M12 1L23 9l-4 14H5L1 9z" fill="${C.stance}" stroke="${C.stance}" stroke-width="1" stroke-linejoin="round"/>` +
    glyph(C.plate),
  condition: (glyph) => `<circle cx="12" cy="12" r="11" fill="${C.condition}"/>` + glyph(C.plate),
  hex: (glyph) => `<path d="M12 0.5L23.5 12 12 23.5 0.5 12z" fill="${C.hex}"/>` + glyph(C.plate),
  enchantment: (glyph) =>
    `<rect x="1" y="1" width="22" height="22" rx="5" fill="${C.enchantment}"/>` + glyph(C.plate),
  preparation: (glyph) =>
    `<path d="M12 1L23.5 22H0.5z" fill="${C.preparation}" stroke="${C.preparation}" stroke-width="1" stroke-linejoin="round"/>` +
    glyph(C.plate),
  glyph: (glyph) =>
    `<path d="M12 23L23.5 2H0.5z" fill="${C.glyph}" stroke="${C.glyph}" stroke-width="1" stroke-linejoin="round"/>` +
    glyph(C.plate),
  shout: (glyph) =>
    `<path d="M6.5 2h11l5.5 10-5.5 10h-11L1 12z" fill="${C.ink}"/>` + glyph(C.plate),
  chant: (glyph) => `<path d="M3 1h18v22l-9-5-9 5z" fill="${C.ink}"/>` + glyph(C.plate),
  // The chant's banner with a swallowtail foot: the banner, answered (#1482).
  echo: (glyph) =>
    `<path d="M3 1h18v22l-4.5-4.5L12 23l-4.5-4.5L3 23z" fill="${C.ink}"/>` + glyph(C.plate),
  "weapon-spell": (glyph) =>
    `<path d="M1.5 1h21v10c0 6.5-5 10-10.5 12.5C6.5 21 1.5 17.5 1.5 11z" fill="${C.weaponSpell}"/>` +
    glyph(C.plate),
  // An urn: a Ritualist's ashes, held (#1434).
  item: (glyph) =>
    `<path d="M7 1h10v3l3 4v11l-3 4H7l-3-4V8l3-4z" fill="${C.ink}"/>` + glyph(C.plate),
  form: (glyph) =>
    `<path d="M7.5 1h9L23 7.5v9L16.5 23h-9L1 16.5v-9z" fill="${C.dervish}"/>` + glyph(C.plate),
  "skill-effect": (glyph) =>
    `<rect x="0.5" y="4" width="23" height="16" rx="8" fill="${C.inkDim}"/>` + glyph(C.plate),
};

// ---------------------------------------------------------------------------
// UI: controls in the HUD and menus. Ink on the panel. The two states of one
// control differ by shape, never by colour alone.
// ---------------------------------------------------------------------------

/** The speaker both sound icons share: a box and a flared cone. */
const speaker = `<path d="M3 9h4l5-5v16l-5-5H3z" fill="${C.ink}"/>`;

/** The beamed eighth notes both music icons share: two heads, two stems, a slab beam, one fill. */
const notes = `<path d="M8.5 18V6L19.5 4v12h-2V7.5l-7 1.5v9zM3 18a3 2 0 1 1 6 0 3 2 0 1 1-6 0M14 16a3 2 0 1 1 6 0 3 2 0 1 1-6 0" fill="${C.ink}"/>`;

/** One dagger, tilted about the icon's centre: the three chain marks share it. */
const chainDagger = (/** @type {number} */ tilt) =>
  `<g transform="rotate(${String(tilt)} 12 12)"><path d="M12 2.5l1.6 3.2V14h-3.2V5.7zM8.5 14h7M12 14v4.5"/><circle cx="12" cy="20" r="1.2"/></g>`;

const ui = {
  // Speaker with two sound waves: sound is on (#112).
  "sound-on": () =>
    speaker + `<path d="M15.5 9a4 4 0 0 1 0 6M18.5 6a8 8 0 0 1 0 12" ${stroke(C.ink, 2)}/>`,
  // Speaker with a cross where the waves were: muted (#112).
  "sound-off": () => speaker + `<path d="M15.5 9l6 6M21.5 9l-6 6" ${stroke(C.ink, 2)}/>`,
  // A speech bubble, its tail at the lower left, three dots in it: the chat (#2018).
  chat: () =>
    `<path d="M4 3.5h16a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-9.5L5 20.5v-4H4A1.5 1.5 0 0 1 2.5 15V5A1.5 1.5 0 0 1 4 3.5z" ${stroke(C.ink, 2)}/>` +
    `<circle cx="7.5" cy="10" r="1.3" fill="${C.ink}"/><circle cx="12" cy="10" r="1.3" fill="${C.ink}"/><circle cx="16.5" cy="10" r="1.3" fill="${C.ink}"/>`,
  // Beamed eighth notes: music is on (#372).
  "music-on": () => notes,
  // The same notes under a slash cased in the background: music is muted (#372).
  "music-off": () =>
    notes + `<path d="M4 4l16 16" ${stroke(C.bg, 4)}/><path d="M4 4l16 16" ${stroke(C.ink, 2)}/>`,
  // A gear: a ring with eight teeth, the options (#454).
  settings: () =>
    `<circle cx="12" cy="12" r="6.2" ${stroke(C.ink, 2.2)}/><circle cx="12" cy="12" r="2.4" ${stroke(C.ink, 2)}/>` +
    `<path d="M18.5 12.0L21.8 12.0M16.6 16.6L18.9 18.9M12.0 18.5L12.0 21.8M7.4 16.6L5.1 18.9M5.5 12.0L2.2 12.0M7.4 7.4L5.1 5.1M12.0 5.5L12.0 2.2M16.6 7.4L18.9 5.1" ${stroke(C.ink, 3)}/>`,
  // A question mark in a ring: the player docs, Help (#1257).
  help: () =>
    `<circle cx="12" cy="12" r="9.5" ${stroke(C.ink, 2)}/>` +
    `<path d="M9 9.2a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.9v.8" ${stroke(C.ink, 2.2)}/><circle cx="12" cy="17.6" r="1.3" fill="${C.ink}"/>`,
  // Four corner brackets pointing out: enter fullscreen (#454).
  fullscreen: () => `<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" ${stroke(C.ink, 2.2)}/>`,
  // The same corners pointing in: leave fullscreen (#454).
  "fullscreen-exit": () =>
    `<path d="M4 9h5V4M15 4v5h5M20 15h-5v5M9 20v-5H4" ${stroke(C.ink, 2.2)}/>`,
  // Two crossed swords, tips up, guards and grips low: you are auto-attacking
  // (#160). Two blades, so it never reads as the one-sword attack skill type.
  attacking: () =>
    `<path d="M4 4l13 13M20 4L7 17M14 20l6-6M10 20l-6-6M17 17l3.5 3.5M7 17l-3.5 3.5" ${stroke(C.ink, 2)}/>`,
  // A dagger leaning right, one leaning left, both: the next blow of your
  // dagger chain is the lead, the off-hand, or a dual attack (#916). The shape
  // carries the state; the Assassin's red only says whose chain it is.
  "chain-lead": () => `<g ${stroke(C.assassin, 2)}>${chainDagger(35)}</g>`,
  "chain-off-hand": () => `<g ${stroke(C.assassin, 2)}>${chainDagger(-35)}</g>`,
  "chain-dual": () => `<g ${stroke(C.assassin, 2)}>${chainDagger(35)}${chainDagger(-35)}</g>`,
};

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Projectiles: ranged weapon shots in flight (#161). Not icons: sprites on a
// 32x12 grid, pointing along +x, so the scene rotates them to the heading.
// White under a `bg` outline, because the scene tints each one to the
// shooter's team colour: the tint gives the team, the silhouette the weapon.
// One path each, outline painted under the fill, so overlapping parts merge.
// ---------------------------------------------------------------------------

/**
 * One path in white, or several as [path, grey] pairs: the scene's tint
 * multiplies, so a grey part stays a darker tone of the team colour.
 * @param {string | [string, string][]} parts
 */
const projectileSprite = (parts) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 12" width="32" height="12">` +
  (typeof parts === "string"
    ? [{ d: parts, fill: "#fff" }]
    : parts.map(([d, fill]) => ({ d, fill }))
  )
    .map(
      ({ d, fill }) =>
        `<path d="${d}" fill="${fill}" stroke="${C.bg}" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke"/>`,
    )
    .join("") +
  "</svg>\n";

const projectile = {
  // Arrow (bows): thin shaft, triangular head, chevron fletching.
  arrow: "M6 5h17v2H6zM22 2l8 4-8 4zM2 2h3l4 4-4 4H2l3-4z",
  // Spear: thicker shaft, a long leaf blade, no fletching.
  spear: "M2 4.75h18v2.5H2zM17 6l5-4L31 6l-9 4z",
  // Bolt (wand and staff): a bright orb with a tapering comet tail.
  bolt: "M2 6l20-3.5v7zM24.5 6m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0",
  // The flying spells (#1176): white and grey like the rest, so the tint still
  // gives the team; the silhouette gives the spell.
  // Fireball: a round head and a ragged flame tail.
  fireball: [
    ["M2 6L9 3L11 4.5L15 1.5L17 4L21 2.5V9.5L17 8L15 10.5L11 7.5L9 9Z", "#c8c8c8"],
    ["M24.5 6m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0", "#fff"],
  ],
  // Lightning orb: a head with jagged sparks forking back from it.
  "lightning-orb": [
    ["M20 5.5L15 2.5L16 5L10 1.5L13.5 5.8L7 5L14 7.5L9 10.5L16.5 8L19 8.5Z", "#c8c8c8"],
    ["M25 6m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0", "#fff"],
  ],
  // Ice shard: a long faceted diamond, a pale facet along its top.
  "ice-shard": [
    ["M2 6L10 2.2L30 6L10 9.8Z", "#c8c8c8"],
    ["M2 6L10 2.2L30 6Z", "#fff"],
  ],
  // Water trident: a shaft and three parallel prongs on a crossbar.
  "water-trident": [
    ["M2 5.2H21V6.8H2Z", "#c8c8c8"],
    ["M20.5 1.2H23V10.8H20.5ZM22 1.2H30V2.8H22ZM22 5.2H31V6.8H22ZM22 9.2H30V10.8H22Z", "#fff"],
  ],
  // Ebon hawk: wings swept back from a small body, a hooked beak.
  "ebon-hawk": [
    ["M21 6L9 0.8L3 1.8L13 6L3 10.2L9 11.2Z", "#c8c8c8"],
    ["M12 6C12 4.4 16 4.2 24 5L30 6L24 7C16 7.8 12 7.6 12 6Z", "#fff"],
  ],
  // Stone: a rough boulder with chips flying off behind it.
  stone: [
    ["M3 4.5L7 4L6 6.5ZM6 8.5L11 8L10 10.5Z", "#c8c8c8"],
    ["M14 7L16 2.5L21 1L27 2L30 6L28 10L22 11L16 10Z", "#fff"],
  ],
  // Thrown dagger (Disrupting, Crippling): a grey hilt and crossguard, a long
  // white blade.
  "thrown-dagger": [
    ["M2 4.75h7v2.5H2zM9 1.5h2.5v9H9z", "#c8c8c8"],
    ["M11.5 3.5L26 4.5L31 6L26 7.5L11.5 8.5Z", "#fff"],
  ],
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

// ---------------------------------------------------------------------------
// Creatures (#1162): the kind glyph on a creature's plate, from
// scripts/assets/creature-study.mjs (#1158, direction C). The study draws
// each in a 12-unit box; here it is a 14-unit box spread over the grid, so
// the horns fit. The arena tints them flat, so the skull's eyes are holes
// (fill-rule evenodd), never painted.
// ---------------------------------------------------------------------------

/** A circle as a closed sub-path, to cut a hole with evenodd. @param {number} cx @param {number} cy @param {number} r */
const ring = (cx, cy, r) =>
  `M${String(cx - r)} ${String(cy)}a${String(r)} ${String(r)} 0 1 0 ${String(2 * r)} 0a${String(r)} ${String(r)} 0 1 0 ${String(-2 * r)} 0Z`;

const SKULL = `<path fill-rule="evenodd" d="M0-4.6A4.2 4.2 0 0 1 3 2.6V4.8H-3V2.6A4.2 4.2 0 0 1 0-4.6Z${ring(-1.6, -0.3, 1.1)}${ring(1.6, -0.3, 1.1)}" fill="${C.ink}"/>`;

/** @param {string} body in the study's units, centred on the origin */
const creatureGlyph = (body) =>
  svg(`<g transform="translate(12 12) scale(${(24 / 14).toFixed(3)})">${body}</g>`);

const creature = {
  beast: () =>
    creatureGlyph(
      `<ellipse cx="0" cy="2.4" rx="3.2" ry="2.6" fill="${C.ink}"/>` +
        [
          [-4.2, -1],
          [-1.5, -3.9],
          [1.5, -3.9],
          [4.2, -1],
        ]
          .map(([x, y]) => `<circle cx="${String(x)}" cy="${String(y)}" r="1.35" fill="${C.ink}"/>`)
          .join(""),
    ),
  "bone-minion": () => creatureGlyph(SKULL),
  "bone-horror": () =>
    creatureGlyph(
      SKULL +
        `<path d="M-3.2-2.8C-5.4-3.4-5.8-5-5.4-6.4M3.2-2.8C5.4-3.4 5.8-5 5.4-6.4" fill="none" stroke="${C.ink}" stroke-width="1.5" stroke-linecap="round"/>`,
    ),
  // Bat wings and fangs on the skull: the vampiric horror (#1860).
  "vampiric-horror": () =>
    creatureGlyph(
      SKULL +
        `<path d="M-3.4-1.5L-7-4.4L-6.6-0.6L-5.4 0.6L-5.6 3.6L-3.4 2ZM3.4-1.5L7-4.4L6.6-0.6L5.4 0.6L5.6 3.6L3.4 2Z" fill="${C.ink}"/>` +
        `<path d="M-1.9 4.6L-1.2 7L-0.5 4.6ZM0.5 4.6L1.2 7L1.9 4.6Z" fill="${C.ink}"/>`,
    ),
  // A square head on wide shoulders, stitched across the brow: the flesh golem (#1860).
  "flesh-golem": () =>
    creatureGlyph(
      `<path fill-rule="evenodd" d="M-3.2-6H3.2V0.4H-3.2ZM-7 1.6H7V6.4H-7Z` +
        `M-2.1-3.6H-0.7V-2.2H-2.1ZM0.7-3.6H2.1V-2.2H0.7ZM-3.2-1.2H3.2V-0.6H-3.2Z" fill="${C.ink}"/>`,
    ),
  // The skull bristling with spikes: the Jagged Horror a Shambling Horror leaves (#1860).
  "jagged-horror": () =>
    creatureGlyph(
      SKULL +
        `<path d="M-1.6-4.3L-2.6-7L-0.4-4.9L0-7.4L0.4-4.9L2.6-7L1.6-4.3ZM-3.4-3L-6.4-4.4L-3.9-1.8ZM3.4-3L6.4-4.4L3.9-1.8ZM-3.9 0.6L-6.8 1.4L-3.9 2.4ZM3.9 0.6L6.8 1.4L3.9 2.4Z" fill="${C.ink}"/>`,
    ),
  // The skull, bleeding from below: the shambling horror (#1860).
  "shambling-horror": () =>
    creatureGlyph(
      `<g transform="translate(0 -1.8)">${SKULL}</g>` +
        `<path d="M-2.4 2.8C-1.29 4.39 -1.29 5.6 -2.4 5.6C-3.5 5.6 -3.5 4.39 -2.4 2.8ZM0.2 4.2C1.3 5.8 1.3 7 0.2 7C-0.90 7 -0.90 5.8 0.2 4.2ZM2.6 2.40C3.7 4 3.7 5.2 2.6 5.2C1.5 5.2 1.5 4 2.6 2.40Z" fill="${C.ink}"/>`,
    ),
  spirit: () =>
    creatureGlyph(
      `<path d="M0-5.6C3-2.4 4.2 0 4.2 2.2A4.2 4.2 0 0 1-4.2 2.2C-4.2 0-2.2-1.2 0-5.6Z" fill="${C.ink}"/>`,
    ),
};

// ---------------------------------------------------------------------------
// Skill icons (#719): one per implemented skill. A profession plate with its
// silhouette as a faint watermark, one glyph from the vocabulary in glyphs/ for the
// skill's primary effect, and a modifier at the bottom right. The type badge
// and the elite frame are drawn by the UI around the icon, not baked in. The
// glyph and modifier are `ink` only: no hue carries a meaning here, only the
// plate's profession tint, which the shapes never depend on.
// ---------------------------------------------------------------------------

/**
 * The tile colour: the profession's hue, 30% of the way from the plate.
 * @param {string} hex
 */
function plateTint(hex) {
  const rgb = (/** @type {string} */ h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = rgb(C.plate);
  const b = rgb(hex);
  return `#${a
    .map((v, i) =>
      Math.round(v + ((b[i] ?? 0) - v) * 0.3)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * @param {string} id e.g. `elementalist.fireball`
 * @param {{ glyph: string, modifier?: string }} row
 */
function skillIcon(id, row) {
  const owner = id.slice(0, id.indexOf("."));
  // A Common skill (#474) belongs to no profession: the dim ink, no watermark.
  const name = owner === "common" ? undefined : /** @type {keyof typeof profession} */ (owner);
  const hue = name === undefined ? C.inkDim : C[name];
  const glyph = GLYPHS[row.glyph];
  if (glyph === undefined) throw new Error(`${id}: no glyph "${row.glyph}"`);
  const modifier = row.modifier === undefined ? undefined : MODIFIERS[row.modifier];
  if (row.modifier !== undefined && modifier === undefined) {
    throw new Error(`${id}: no modifier "${row.modifier}"`);
  }
  return svg(
    `<rect x="1" y="1" width="22" height="22" rx="3.5" fill="${plateTint(hue)}" stroke="${hue}" stroke-width="1"/>` +
      (name === undefined
        ? ""
        : `<g opacity="0.2" transform="translate(3,3) scale(0.75)">${profession[name]()}</g>`) +
      `<g transform="translate(1.2,1.2) scale(0.88)">${glyph.draw()}</g>` +
      (modifier === undefined
        ? ""
        : `<circle cx="19" cy="18" r="4.6" fill="${C.bg}" fill-opacity="0.85"/>${modifier.draw()}`),
  );
}

/**
 * A hole in an even-odd fill: a circle of radius `r` at (`x`, `y`).
 * @param {number} x @param {number} y @param {number} r
 */
const hole = (x, y, r) =>
  `M${String(x - r)} ${String(y)}a${String(r)} ${String(r)} 0 1 0 ${String(2 * r)} 0a${String(r)} ${String(r)} 0 1 0 ${String(-2 * r)} 0Z`;

/** Solid shapes with even-odd holes, in the ink: the rail masks them, so only the shape counts (#1554). @param {string} d */
const solid = (d) => `<path fill-rule="evenodd" d="${d}" fill="${C.ink}"/>`;
/** @param {string} d @param {number} [w] */
const rule = (d, w = 1.6) => `<path d="${d}" ${stroke(C.ink, w)}/>`;

/** A helmet of width `w` standing on y = 20, a slit for the eyes (#1554). @param {number} cx @param {number} w @param {number} top */
const helm = (cx, w, top) => {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const f = (/** @type {number} */ n) => String(Math.round(n * 100) / 100);
  const arc = w / 2;
  const yEye = top + arc + 0.5;
  return (
    `M${f(l)} 20V${f(top + arc)}A${f(arc)} ${f(arc)} 0 0 1 ${f(r)} ${f(top + arc)}V20Z` +
    `M${f(l + 1.4)} ${f(yEye)}H${f(r - 1.4)}V${f(yEye + 1.5)}H${f(l + 1.4)}Z`
  );
};

/** The five pips of the die (#1554). @type {readonly (readonly [number, number])[]} */
const PIPS = [
  [8.3, 8.3],
  [15.7, 8.3],
  [12, 12],
  [8.3, 15.7],
  [15.7, 15.7],
];

/** @type {Record<string, () => string>} */
const mode = {
  // A tilted die with five pips: the luck of the draw.
  "random-arena": () =>
    `<g transform="rotate(-12 12 12)">` +
    solid(
      "M7 3.5H17A3.5 3.5 0 0 1 20.5 7V17A3.5 3.5 0 0 1 17 20.5H7A3.5 3.5 0 0 1 3.5 17V7A3.5 3.5 0 0 1 7 3.5Z" +
        PIPS.map(([x, y]) => hole(x, y, 1.5)).join(""),
    ) +
    "</g>",
  // Two shields side by side, the near one solid: a team against a team.
  "team-arena": () =>
    solid("M2.5 8L8.5 6L14.5 8V13C14.5 17 11.5 19.5 8.5 21C5.5 19.5 2.5 17 2.5 13Z") +
    rule("M10.5 4.6L15.5 3L21.5 4.6V9.6C21.5 13.4 19 15.8 16.4 17.2", 1.8),
  // A stepped altar with a flame on top: the relic run's goal.
  "heroes-ascent": () =>
    solid("M2.5 21.5V17.5H5.5V13.5H8.5V10H15.5V13.5H18.5V17.5H21.5V21.5Z") +
    solid("M12 2C13.9 4.3 14.9 5.4 14.9 6.8A2.9 2.9 0 0 1 9.1 6.8C9.1 5.5 10.2 4.8 12 2Z"),
  // A keep with a pennant on a tall pole: guild against guild.
  gvg: () =>
    solid(
      "M3.5 21.5V11H6.5V13H8.5V11H15.5V13H17.5V11H20.5V21.5Z" +
        "M10.5 21.5V17.5A1.5 1.5 0 0 1 13.5 17.5V21.5Z",
    ) +
    rule("M12 11V2.5", 1.6) +
    solid("M12 2.5H19L16.6 5L19 7.5H12Z"),
  // A door with a keyhole: you open the room, your friends come in.
  "hosted-game": () =>
    solid(
      "M5.5 21V9.5A6.5 6.5 0 0 1 18.5 9.5V21Z" + hole(12, 11, 1.8) + "M11 12.5H13L13.6 17H10.4Z",
    ) + rule("M3 21.5H21", 1.6),
  // One helmet, crest up: your character.
  characters: () => solid(helm(12, 16, 4)) + solid("M10.5 4.5V2H13.5V4.5Z"),
  // Three helmets in a row, the middle one taller: the team.
  teams: () => solid(helm(5, 7, 7.5)) + solid(helm(12, 8.4, 3)) + solid(helm(19, 7, 7.5)),
};

/** @type {Record<string, Record<string, string>>} */
const gear = gearIcons(profession, plateTint);

const families = {
  profession: Object.fromEntries(Object.entries(profession).map(([k, f]) => [k, svg(f())])),
  creature: Object.fromEntries(Object.entries(creature).map(([k, f]) => [k, f()])),
  "skill-type": Object.fromEntries(Object.entries(skillType).map(([k, f]) => [k, svg(f())])),
  weapon: Object.fromEntries(Object.entries(weaponShapes).map(([k, s]) => [k, fitIcon(s)])),
  offhand: Object.fromEntries(
    Object.entries(offhandShapes).map(([k, [s, scaled]]) => [
      k,
      fitIcon(s, { maxScale: 3, scaleStrokes: scaled }),
    ]),
  ),
  skill: {
    // What a skill id this client does not know shows: a bare plate, no glyph.
    unknown: svg(
      `<rect x="1" y="1" width="22" height="22" rx="3.5" fill="${C.plate}" stroke="${C.inkDim}" stroke-width="1"/>`,
    ),
    ...Object.fromEntries(Object.entries(SKILL_ICONS).map(([id, row]) => [id, skillIcon(id, row)])),
  },
  insignia: gear.insignia,
  rune: gear.rune,
  "paper-doll": { figure: paperDollFigure() },
  mode: Object.fromEntries(Object.entries(mode).map(([k, f]) => [k, svg(f())])),
  ui: Object.fromEntries(Object.entries(ui).map(([k, f]) => [k, svg(f())])),
  projectile: Object.fromEntries(
    Object.entries(projectile).map(([k, parts]) => [k, projectileSprite(parts)]),
  ),
  status: Object.fromEntries(
    Object.entries(STATUS_ICONS).map(([k, [category, glyph]]) => [k, svg(plates[category](glyph))]),
  ),
};

if (process.argv.includes("--vocabulary")) {
  // The glyph vocabulary (#2021), by name: what each glyph means. No file is written.
  for (const [name, { means }] of Object.entries(GLYPHS).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${name}: ${means}`);
  }
  process.exit(0);
}

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
