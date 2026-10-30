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

import { SKILL_ICONS } from "./skill-icon-table.mjs";
import { WEAPON_MARK_GEOMETRY } from "../../apps/web/src/render/weapon-mark-geometry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// The stale-output test in apps/web runs this into a scratch directory.
const outDir = process.env.VIBEWARS_ICONS_OUT ?? join(root, "apps", "web", "public", "icons");

/** The palette. Mirrors the tokens table in docs/art/art-direction.md. */
const C = {
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

/** @typedef {(colour: string) => string} Glyph */
/** @typedef {"condition" | "hex" | "enchantment" | "stance" | "preparation" | "glyph" | "shout" | "chant" | "weapon-spell" | "form" | "skill-effect"} Category */

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
  "weapon-spell": (glyph) =>
    `<path d="M1.5 1h21v10c0 6.5-5 10-10.5 12.5C6.5 21 1.5 17.5 1.5 11z" fill="${C.weaponSpell}"/>` +
    glyph(C.plate),
  form: (glyph) =>
    `<path d="M7.5 1h9L23 7.5v9L16.5 23h-9L1 16.5v-9z" fill="${C.dervish}"/>` + glyph(C.plate),
  "skill-effect": (glyph) =>
    `<rect x="0.5" y="4" width="23" height="16" rx="8" fill="${C.inkDim}"/>` + glyph(C.plate),
};

/**
 * A germ (#765): a body and six knobbed spikes, so it never reads as a sun.
 * @param {string} c
 */
const germ = (c) =>
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
  // A shield split by a crack: your armor gives (#763).
  "cracked-armor": [
    "condition",
    (c) =>
      `<path d="M6.5 5.5h11v5.5c0 3.5-2.5 5.5-5.5 7.5-3-2-5.5-4-5.5-7.5z" fill="${c}"/>` +
      `<path d="M12.5 5.5l-2 4 3 2-2.5 4" ${stroke(C.condition, 1.6)}/>`,
  ],
  // Cross cut.
  "deep-wound": ["condition", (c) => `<path d="M7 7l10 10M17 7L7 17" ${stroke(c, 3)}/>`],
  // Five-point star: seeing stars.
  dazed: [
    "condition",
    (c) =>
      `<path d="M12 4.5l2.2 4.6 5 .6-3.7 3.5 1 5L12 15.8l-4.5 2.4 1-5-3.7-3.5 5-.6z" fill="${c}"/>`,
  ],
  // A germ: it catches.
  disease: ["condition", germ],
  // Hex: a heart, because the hex is on your life and your nerve.
  faintheartedness: [
    "hex",
    (c) => `<path d="M12 16l-3.6-3.6a2.1 2.1 0 0 1 3.6-3 2.1 2.1 0 0 1 3.6 3z" fill="${c}"/>`,
  ],
  // Enchantment: plus, health coming back.
  regeneration: ["enchantment", (c) => `<path d="M12 6v12M6 12h12" ${stroke(c, 3)}/>`],
  // Enchantment: the same plus inside a ring, health kept coming back for
  // as long as its caster maintains it (#837).
  mending: [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="7.5" ${stroke(c, 1.6)}/>` +
      `<path d="M12 8.5v7M8.5 12h7" ${stroke(c, 2.5)}/>`,
  ],
  // Enchantment: an hourglass run out into a plus, the heal waiting at
  // the end of its time (#944).
  "patient-spirit": [
    "enchantment",
    (c) =>
      `<path d="M7 5h10L7 15h10z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 15.5v4M10 17.5h4" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a veil drawn over its bearer, hexes held back (#944).
  "holy-veil": [
    "enchantment",
    (c) =>
      `<path d="M5 18c0-7 3-12 7-12s7 5 7 12" ${stroke(c, 2)}/>` +
      `<path d="M9 18c0-4 1.3-7 3-7s3 3 3 7" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a plus carried on two gusts, health on the wind (#1013).
  "healing-breeze": [
    "enchantment",
    (c) =>
      `<path d="M15 4v7M11.5 7.5h7" ${stroke(c, 2.5)}/>` +
      `<path d="M4 15.5h9a2 2 0 1 0-2-2M4 18.5h7a2 2 0 1 1-2 2" ${stroke(c, 1.6)}/>`,
  ],
  // Stance: two chevrons, forward: move 25% faster.
  sprint: ["stance", (c) => `<path d="M7 9l4.5 5L7 19M12.5 9l4.5 5-4.5 5" ${stroke(c, 2.5)}/>`],
  // Stance: an arrowhead trailing speed lines: run 50% faster.
  dash: [
    "stance",
    (c) =>
      `<path d="M20 14l-7-5v10z" fill="${c}"/>` +
      `<path d="M5 11h5M5 17h5M3.5 14h7" ${stroke(c, 2)}/>`,
  ],
  // Stance: three quick slashes: attack faster, take double damage (#919).
  frenzy: [
    "stance",
    (c) => `<path d="M6.5 18l3-8.5M10.5 18l3-8.5M14.5 18l3-8.5" ${stroke(c, 2.2)}/>`,
  ],
  // Stance: a crescent moon, into the shadows: faster, half damage (#919).
  "dark-escape": [
    "stance",
    (c) => `<path d="M14.5 8a6 6 0 1 0 0 11a4.8 4.8 0 0 1 0-11z" fill="${c}"/>`,
  ],
  // Stance: a leaf, the wild's stride: faster, blocks (#919).
  "natural-stride": [
    "stance",
    (c) =>
      `<path d="M7 19c0-6 4-10.5 10-10.5 0 6-4 10.5-10 10.5z" ${stroke(c, 1.8)}/>` +
      `<path d="M7 19l6.5-6.5" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: a bolt, blocks and attacks faster (#976).
  "lightning-reflexes": [
    "stance",
    (c) => `<path d="M13.5 5L8 13h4l-1.5 6L16 11h-4z" ${stroke(c, 2)}/>`,
  ],
  // Stance: two chevrons and a bar, away and blocking (#976).
  escape: [
    "stance",
    (c) =>
      `<path d="M6 8.5l4 3.5-4 3.5M11 8.5l4 3.5-4 3.5" ${stroke(c, 2.2)}/>` +
      `<path d="M18 7.5v9" ${stroke(c, 2.2)}/>`,
  ],
  // Stance: a shield with a plus, Energy for each melee block (#1329).
  "bonettis-defense": [
    "stance",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M12 9v6M9 12h6" ${stroke(c, 2)}/>`,
  ],
  // Stance: an arrow glancing off a shield (#1329).
  "deflect-arrows": [
    "stance",
    (c) =>
      `<path d="M9 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M3 15l5-4-3-5" ${stroke(c, 2)}/>`,
  ],
  // Stance: a shield with a blade through it, blocks that cut back (#1329).
  "gladiators-defense": [
    "stance",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M5 19L19 5" ${stroke(c, 2)}/>`,
  ],
  // Stance: a shield, filled, armor and blocks (#1329).
  "disciplined-stance": [
    "stance",
    (c) => `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" fill="${c}"/>`,
  ],
  // Stance: a figure standing firm on a wide base, never knocked down (#1329).
  "balanced-stance": ["stance", (c) => `<path d="M12 5v9M6 19l6-5 6 5" ${stroke(c, 2.6)}/>`],
  // Stance: an arrow come round, spells back sooner (#938).
  "mantra-of-recovery": [
    "stance",
    (c) =>
      `<path d="M16.5 10.5A5 5 0 1 0 17 15" ${stroke(c, 2)}/>` +
      `<path d="M14 9.5l3.5-1 .5 3.5z" fill="${c}"/>`,
  ],
  // Preparation: one drop, your attacks poison (#525).
  "apply-poison": [
    "preparation",
    (c) => `<path d="M12 8.5c-2 3-3 4.6-3 6.2a3 3 0 0 0 6 0c0-1.6-1-3.2-3-6.2z" fill="${c}"/>`,
  ],
  // Glyph: a bolt, your next spells cost less energy (#526).
  "glyph-of-lesser-energy": [
    "glyph",
    (c) => `<path d="M13.5 4.5L8.5 11h3.5l-1.5 5 5-6.5H12z" fill="${c}"/>`,
  ],
  // Enchantment: a dot spreading to three, a condition handed on (#887).
  contagion: [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="13" r="2.5" fill="${c}"/>` +
      `<circle cx="12" cy="6" r="1.6" fill="${c}"/>` +
      `<circle cx="6" cy="17" r="1.6" fill="${c}"/>` +
      `<circle cx="18" cy="17" r="1.6" fill="${c}"/>`,
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
  // Hex: an arrow turning back on itself, a spell that hurts its caster (#469).
  backfire: [
    "hex",
    (c) =>
      `<path d="M15.5 8.5A4.5 4.5 0 1 0 16.5 13" ${stroke(c, 2.2)}/>` +
      `<path d="M13 6.5l3.5 2-2 3.5z" fill="${c}"/>`,
  ],
  // Hex: a sword point down, an attack that hurts its attacker (#469).
  empathy: ["hex", (c) => `<path d="M12 18.5v-10M8.5 8.5h7M12 8.5v-4" ${stroke(c, 2.5)}/>`],
  // Hex: an hourglass, the next skill's recharge drawn out (#949).
  diversion: [
    "hex",
    (c) =>
      `<path d="M8 6h8M8 18h8" ${stroke(c, 2)}/>` +
      `<path d="M9 6.5c0 3 6 3.5 6 5.5s-6 2.5-6 5.5M15 6.5c0 3-6 3.5-6 5.5s6 2.5 6 5.5" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a dot and two waves, the next spell sounding again (#469).
  "arcane-echo": [
    "enchantment",
    (c) =>
      `<circle cx="8" cy="12" r="2.2" fill="${c}"/>` +
      `<path d="M12 8a5 5 0 0 1 0 8M15.5 5.5a8.5 8.5 0 0 1 0 13" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a bar and two waves, the next skill sounding again (#469).
  echo: [
    "enchantment",
    (c) =>
      `<path d="M7.5 8v8" ${stroke(c, 2.5)}/>` +
      `<path d="M12 8a5 5 0 0 1 0 8M15.5 5.5a8.5 8.5 0 0 1 0 13" ${stroke(c, 2)}/>`,
  ],
  // Hex: two links of a chain, the bond that heals its caster when it ends (#887).
  "parasitic-bond": [
    "hex",
    (c) =>
      `<rect x="5" y="9.5" width="8" height="5" rx="2.5" ${stroke(c, 2)}/>` +
      `<rect x="11" y="9.5" width="8" height="5" rx="2.5" ${stroke(c, 2)}/>`,
  ],
  // Hex: an ice shard, the cold slowing you (#918).
  "shard-storm": ["hex", (c) => `<path d="M12 5.5L15 12L12 18.5L9 12z" fill="${c}"/>`],
  // Hex: two chevrons pointing back, attacks slowed (#918).
  "shadow-of-fear": [
    "hex",
    (c) => `<path d="M14.5 8L11 12l3.5 4M11 8L7.5 12l3.5 4" ${stroke(c, 2)}/>`,
  ],
  // Hex: a burst with a dot at its heart, the spirit striking out (#935).
  "spiteful-spirit": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12.5" r="2" fill="${c}"/>` +
      `<path d="M12 5.5v2.5M12 17v2.5M5 12.5h2.5M16.5 12.5H19M7 7.5l1.8 1.8M15.2 15.7L17 17.5M17 7.5l-1.8 1.8M8.8 15.7L7 17.5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a drop drawn off by an arrow, health stolen on each hit (#935).
  "insidious-parasite": [
    "hex",
    (c) =>
      `<path d="M10 6c2 3 3.5 4.8 3.5 7a3.5 3.5 0 0 1-7 0c0-2.2 1.5-4 3.5-7z" fill="${c}"/>` +
      `<path d="M14.5 10.5h4M16.5 8.5l2 2-2 2" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a cross with two rings beside it, pain passed to who stands near (#935).
  "mark-of-pain": [
    "hex",
    (c) =>
      `<path d="M10 9.5l4 4M14 9.5l-4 4" ${stroke(c, 2.2)}/>` +
      `<circle cx="6.5" cy="15.5" r="1.5" ${stroke(c, 1.5)}/>` +
      `<circle cx="17.5" cy="15.5" r="1.5" ${stroke(c, 1.5)}/>`,
  ],
  // Hex: three ice spikes falling, the cold slowing you (#938).
  "ice-spikes": [
    "hex",
    (c) =>
      `<path d="M7.5 7l1.5 10 1.5-10zM10.5 7l1.5 11 1.5-11zM13.5 7l1.5 10 1.5-10z" fill="${c}"/>`,
  ],
  // Hex: a snowflake, the ground frozen under you (#938).
  "deep-freeze": ["hex", (c) => `<path d="M12 6v12M6.8 9l10.4 6M6.8 15l10.4-6" ${stroke(c, 2)}/>`],
  // Enchantment: a shield in outline with a blow glancing off it, block (#534).
  guardian: [
    "enchantment",
    (c) =>
      `<path d="M7 5.5h10v5.5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" ${stroke(c, 2)}/>` +
      `<path d="M9.5 14L15 8.5" ${stroke(c, 2.2)}/>`,
  ],
  // Shout: a shield with a warning mark, armor called for (#524).
  "watch-yourself": [
    "shout",
    (c) =>
      `<path d="M7 5.5h10v5.5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" ${stroke(c, 2)}/>` +
      `<path d="M12 8.5v3.5" ${stroke(c, 2.2)}/><circle cx="12" cy="14.6" r="1.1" fill="${c}"/>`,
  ],
  // Shout: two chevrons up, a strike and one more per hit (#936).
  "for-great-justice": [
    "shout",
    (c) => `<path d="M7.5 12l4.5-4.5 4.5 4.5M7.5 16.5l4.5-4.5 4.5 4.5" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a shield under a line, no hit past 10% (#936).
  "protective-spirit": [
    "enchantment",
    (c) =>
      `<path d="M7 7.5h10v4c0 3-2.5 5-5 6.5C9.5 16.5 7 14.5 7 11.5z" ${stroke(c, 2)}/>` +
      `<path d="M6 4.5h12" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a crescent over a plus, healed in the shadows (#988).
  "shadow-refuge": [
    "enchantment",
    (c) =>
      `<path d="M11 5a5 5 0 1 0 0 9a4 4 0 0 1 0-9z" fill="${c}"/>` +
      `<path d="M16.5 13v6M13.5 16h6" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a crescent inside a broken shield outline, armored while it holds back (#1349).
  "feigned-neutrality": [
    "enchantment",
    (c) =>
      `<path d="M12 3L19 5.8V11.5C19 15.8 16 18.8 12 20.8" ${stroke(c, 2)}/>` +
      `<path d="M12 3L5 5.8V11.5C5 15.8 8 18.8 12 20.8" ${stroke(c, 2)} stroke-dasharray="3 3"/>` +
      `<path d="M13 8a4 4 0 1 0 0 7a3.2 3.2 0 0 1 0-7z" fill="${c}"/>`,
  ],
  // Enchantment: a crescent beside a four-point spark and a plus, health from each critical hit (#1349).
  "way-of-perfection": [
    "enchantment",
    (c) =>
      `<path d="M9.5 3.5a5 5 0 1 0 0 9a4 4 0 0 1 0-9z" fill="${c}"/>` +
      `<path d="M16.5 8l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="${c}"/>` +
      `<path d="M7 17v5M4.5 19.5h5" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a shield, half filled, blocks below half Health (#988).
  "shroud-of-distress": [
    "enchantment",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M7 12h10c-.5 3-2.6 4.8-5 6-2.4-1.2-4.5-3-5-6z" fill="${c}"/>`,
  ],
  // Skill: an eye, more critical hits (#988).
  "critical-eye": [
    "skill-effect",
    (c) =>
      `<path d="M4 12.5c2-3.5 5-5.5 8-5.5s6 2 8 5.5c-2 3.5-5 5.5-8 5.5s-6-2-8-5.5z" ${stroke(c, 2)}/>` +
      `<circle cx="12" cy="12.5" r="2.5" fill="${c}"/>`,
  ],
  // Skill: two crossed blades, every sword attack cuts all round (#1354).
  "hundred-blades": [
    "skill-effect",
    (c) =>
      `<path d="M6 6l12 12M18 6L6 18" ${stroke(c, 2)}/>` +
      `<path d="M5 15l4 4M15 19l4-4" ${stroke(c, 2)}/>`,
  ],
  // Stance: three chevrons, a charge at 25% faster (#1359).
  rush: ["stance", (c) => `<path d="M4 9l4 5-4 5M10 9l4 5-4 5M16 9l4 5-4 5" ${stroke(c, 2)}/>`],
  // Skill effect: a heavy block on four short legs, armored and slow (#1359).
  "dolyak-signet": [
    "skill-effect",
    (c) =>
      `<rect x="5" y="7" width="14" height="7" rx="1.5" fill="${c}"/>` +
      `<path d="M7 14v5M10.5 14v5M13.5 14v5M17 14v5" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: a heart with a plus, more maximum Health (#1359).
  "endure-pain": [
    "skill-effect",
    (c) =>
      `<path d="M12 19.5l-6.5-6.5a3.8 3.8 0 0 1 6.5-4.5 3.8 3.8 0 0 1 6.5 4.5z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 10.5v5.5M9.2 13.2h5.6" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: a bolt under a ceiling, energy per hit up to a cap (#1359).
  "warriors-endurance": [
    "stance",
    (c) =>
      `<path d="M13.5 7l-5 7h3.5l-1 6 5-7.5h-3.5z" fill="${c}"/>` +
      `<path d="M5 4.5h14" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a shield with a spark, blocks renewed by critical hits (#1315).
  "critical-defenses": [
    "enchantment",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M12 8.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="${c}"/>`,
  ],
  // Enchantment: an arrow turning back up, the next hit heals (#987).
  "reversal-of-fortune": [
    "enchantment",
    (c) => `<path d="M8 6v7a4 4 0 0 0 8 0V8M13 11l3-3 3 3" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a plus thrown up by two strokes, healed on each attack
  // or spell (#1039).
  "vigorous-spirit": [
    "enchantment",
    (c) =>
      `<path d="M12 5v8M8 9h8" ${stroke(c, 2.5)}/>` +
      `<path d="M6.5 18.5l3-3M17.5 18.5l-3-3" ${stroke(c, 2)}/>`,
  ],
  // Shout: an arrow turning back, run and be healed for it (#921).
  "fall-back": ["shout", (c) => `<path d="M17 12H7.5M11 8l-4 4 4 4" ${stroke(c, 2.5)}/>`],
  // Shout: a shield planted on the ground, armor while you stand (#921).
  "stand-your-ground": [
    "shout",
    (c) =>
      `<path d="M8 5h8v4.5c0 2.5-2 4-4 5.2-2-1.2-4-2.7-4-5.2z" ${stroke(c, 2)}/>` +
      `<path d="M6.5 18.5h11" ${stroke(c, 2.5)}/>`,
  ],
  // Shout: an arrow forward with a plus behind it, run and be healed (#956).
  incoming: [
    "shout",
    (c) =>
      `<path d="M11 12h7M15 8.5l3.5 3.5-3.5 3.5" ${stroke(c, 2.5)}/>` +
      `<path d="M7 9.5v5M4.5 12h5" ${stroke(c, 2)}/>`,
  ],
  // Shout: a double chevron, one ally hurried along (#956).
  "make-haste": ["shout", (c) => `<path d="M7 8l4 4-4 4M12.5 8l4 4-4 4" ${stroke(c, 2.5)}/>`],
  // Chant: a shield with a bar across it, blocks for the party (#956).
  "defensive-anthem": [
    "chant",
    (c) =>
      `<path d="M8 6h8v4.5c0 2.5-2 4-4 5.2-2-1.2-4-2.7-4-5.2z" ${stroke(c, 2)}/>` +
      `<path d="M9.5 10h5" ${stroke(c, 2)}/>`,
  ],
  // Chant: a banner with a note, healed on your next skill (#1012).
  "song-of-restoration": [
    "chant",
    (c) =>
      `<path d="M7 4V19.5" ${stroke(c, 2)}/>` +
      `<path d="M7 5H18.5L15 9.5L18.5 14H7Z" ${stroke(c, 1.6)}/>` +
      `<ellipse cx="10.8" cy="11" rx="1.6" ry="1.2" fill="${c}"/>` +
      `<path d="M12.3 11V7.5L14.5 8.4" ${stroke(c, 1.3)}/>`,
  ],
  // Chant: a flame, your next attack skill burns (#758). Burning's flame,
  // smaller and higher, clear of the banner's notch.
  "anthem-of-flame": [
    "chant",
    (c) =>
      `<path d="M14 3.5c.5 3.5 4 5.5 4 10a6 6 0 0 1-12 0c0-2.5 1-4.5 2.5-5.5 0 2 .5 3 1.5 3.5-.5-3 1-6 4-8z" fill="${c}" transform="translate(12 10) scale(0.7) translate(-12 -11.5)"/>`,
  ],
  // Weapon spell: a sword, held up, warded (#758).
  "weapon-of-warding": [
    "weapon-spell",
    (c) => `<path d="M12 4.5v10M8.5 14.5h7M12 14.5v4" ${stroke(c, 2.5)}/>`,
  ],
  // Weapon spell: Warding's blade with a plus beside it, health every second (#975).
  "spirit-light-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M10 4.5v10M6.5 14.5h7M10 14.5v4" ${stroke(c, 2.5)}/>` +
      `<path d="M17 5v6M14 8h6" ${stroke(c, 2)}/>`,
  ],
  // Weapon spell: the blade with a turning arrow, spells back sooner (#975).
  "weapon-of-quickening": [
    "weapon-spell",
    (c) =>
      `<path d="M10 4.5v10M6.5 14.5h7M10 14.5v4" ${stroke(c, 2.5)}/>` +
      `<path d="M15 6.5a3.5 3.5 0 1 1 0 5M15 6.5l-1.5-1.5M15 6.5l-1.5 1.5" ${stroke(c, 1.8)}/>`,
  ],
  // Weapon spell: the blade with two chevrons, attacks faster (#975).
  "weapon-of-aggression": [
    "weapon-spell",
    (c) =>
      `<path d="M10 4.5v10M6.5 14.5h7M10 14.5v4" ${stroke(c, 2.5)}/>` +
      `<path d="M14.5 6l3 3-3 3M17 6l3 3-3 3" ${stroke(c, 1.8)}/>`,
  ],
  // Weapon spell: a blade and a drop drawn back, steals and cleanses (#1022).
  "weapon-of-remedy": [
    "weapon-spell",
    (c) =>
      `<path d="M10 4.5v10M6.5 14.5h7M10 14.5v4" ${stroke(c, 2.5)}/>` +
      `<path d="M17 4.5c-1.8 2.4-2.5 3.6-2.5 4.6a2.5 2.5 0 0 0 5 0c0-1-.7-2.2-2.5-4.6z" ${stroke(c, 1.5)}/>` +
      `<path d="M13.5 4L20.5 11.5" ${stroke(c, 1.6)}/>`,
  ],
  // Weapon spell: a blade and a hook turning back, steals from who hurt it (#1022).
  "vengeful-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M10 4.5v10M6.5 14.5h7M10 14.5v4" ${stroke(c, 2.5)}/>` +
      `<path d="M20 6h-3.5a2.5 2.5 0 0 0 0 5H19M15 4.5L13.5 6 15 7.5" ${stroke(c, 1.8)}/>`,
  ],
  // Weapon spell: a blade and splinters flying off, splashes the adjacent (#1022).
  "splinter-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M10 4.5v10M6.5 14.5h7M10 14.5v4" ${stroke(c, 2.5)}/>` +
      `<path d="M14 4.5l3.5-1-.5 3zM18 7.5l3.5-1-1 3.5zM14.5 10.5l3.5-.5-1 3z" fill="${c}"/>`,
  ],
  // Shout: a plus with a chevron rising over it, regeneration called for (#923).
  "never-surrender": [
    "shout",
    (c) =>
      `<path d="M12 10v8M8 14h8" ${stroke(c, 2.5)}/>` +
      `<path d="M8.5 8.5L12 5l3.5 3.5" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a plus in a ring, health for every enchantment around it (#845).
  "mystic-regeneration": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="7.5" ${stroke(c, 1.8)}/>` +
      `<path d="M12 8.5v7M8.5 12h7" ${stroke(c, 2.5)}/>`,
  ],
  // Enchantment: a post on firm ground, you cannot be knocked down (#845).
  "fleeting-stability": [
    "enchantment",
    (c) => `<path d="M12 5v11M6.5 18.5h11" ${stroke(c, 2.8)}/>`,
  ],
  // Stance: a heart, filled, you attack faster (#845).
  "heart-of-fury": [
    "stance",
    (c) => `<path d="M12 18l-4.8-4.8a2.8 2.8 0 0 1 4.8-4 2.8 2.8 0 0 1 4.8 4z" fill="${c}"/>`,
  ],
  // Enchantment: a blade with a ring round it, slashing all adjacent foes
  // whenever you attack (#939).
  "vow-of-strength": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="7.5" ${stroke(c, 1.6)}/>` +
      `<path d="M8.5 15.5l7-7M9 12.5l2.5 2.5" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: three grains of sand, flung at the foes beside your hit (#939).
  "sand-shards": [
    "enchantment",
    (c) =>
      `<path d="M12 5.5l2 3.5h-4z" fill="${c}"/>` +
      `<path d="M7.5 13l2 3.5h-4z" fill="${c}"/>` +
      `<path d="M16.5 13l2 3.5h-4z" fill="${c}"/>`,
  ],
  // Stance: one chevron, forward: move 25% faster (#939).
  "pious-haste": ["stance", (c) => `<path d="M9.5 9l4.5 5-4.5 5" ${stroke(c, 2.5)}/>`],
  // Stance: three chevrons, forward: run 50% faster, an enchantment paid (#939).
  "pious-haste-run": [
    "stance",
    (c) => `<path d="M5 9l4 5-4 5M9.5 9l4 5-4 5M14 9l4 5-4 5" ${stroke(c, 2.2)}/>`,
  ],
  // Enchantment: a peak split down the middle, your attacks are earth and
  // crack the armor round you when it ends (#1021).
  "staggering-force": [
    "enchantment",
    (c) =>
      `<path d="M5 18l7-11 7 11z" fill="${c}"/>` +
      `<path d="M12 9l-1.5 4 2 2-1 3" ${stroke(C.enchantment, 1.6)}/>`,
  ],
  // Enchantment: a cloud of grains, your attacks are earth and blind the
  // foes round you when it ends (#1021).
  "dust-cloak": [
    "enchantment",
    (c) =>
      `<circle cx="9" cy="10" r="1.6" fill="${c}"/><circle cx="14" cy="8.5" r="1.6" fill="${c}"/>` +
      `<circle cx="12" cy="13" r="1.6" fill="${c}"/><circle cx="7.5" cy="15" r="1.6" fill="${c}"/>` +
      `<circle cx="16.5" cy="14" r="1.6" fill="${c}"/><circle cx="12" cy="17.5" r="1.6" fill="${c}"/>`,
  ],
  // Enchantment: a ring of thorns, bleeding as it lands and crippling when
  // it ends (#1021).
  "aura-of-thorns": [
    "enchantment",
    (c) =>
      `<path d="M4.5 19.5C8 17 14 12 19.5 5" ${stroke(c, 2)}/>` +
      `<path d="M7.5 16L6 11.5M11 13.5L9.5 9M15 10L14.5 5.5M9 17.5L11.5 20M13 14.5L16 17" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: two speed chevrons and a drop, faster until it ends, and a condition goes (#1421).
  "enchanted-haste": [
    "enchantment",
    (c) =>
      `<path d="M4 7l4.5 5L4 17M9.5 7l4.5 5-4.5 5" ${stroke(c, 2)}/>` +
      `<path d="M18.5 8c1.5 2.2 2.5 3.4 2.5 4.8a2.5 2.5 0 0 1-5 0c0-1.4 1-2.6 2.5-4.8z" ${stroke(c, 1.6)}/>` +
      `<path d="M15 6.5l7 13" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a flame under a halo, holy attacks, burning when it ends (#1421).
  "heart-of-holy-flame": [
    "enchantment",
    (c) =>
      `<ellipse cx="12" cy="5.5" rx="5" ry="1.8" ${stroke(c, 1.6)}/>` +
      `<path d="M12 9c2.2 2.2 2.8 4 2.8 5.6a2.8 2.8 0 0 1-5.6 0c0-1.3.7-2.2 1.4-2.9.2 1 .8 1.5 1.4 1.9 0-1.7 0-3 0-4.6z" fill="${c}"/>`,
  ],
  // Enchantment: a flame beside rising bars, adrenaline when it ends (#1421).
  "balthazars-rage": [
    "enchantment",
    (c) =>
      `<path d="M8.5 5c2.5 2.5 3 4.5 3 6.5a3 3 0 0 1-6 0c0-1.7.8-2.7 1.7-3.6.2 1.2.8 1.7 1.3 2.1 0-1.8 0-3.2 0-5z" fill="${c}"/>` +
      `<path d="M15 18v-3M18 18v-6M21 18V9M4 19.5h18" ${stroke(c, 1.8)}/>`,
  ],
  // Form: a leaf, Melandru's earth (#1437).
  "avatar-of-melandru": [
    "form",
    (c) =>
      `<circle cx="12" cy="13" r="2.5" fill="${c}"/>` +
      `<path d="M6 20c0-3.5 2.5-5 6-5s6 1.5 6 5" ${stroke(c, 2.2)}/>` +
      `<path d="M12 10.5V8" ${stroke(c, 1.6)}/>` +
      `<path d="M12 8.5C12 6 10 4.5 6.5 5c0 2.5 1.5 3.7 5.5 3.5zM12 8.5C12 6 14 4.5 17.5 5c0 2.5-1.5 3.7-5.5 3.5z" fill="${c}"/>`,
  ],
  // Form: wings spread, Dwayna's (#1437).
  "avatar-of-dwayna": [
    "form",
    (c) =>
      `<path d="M10 14C8 9.5 5.5 8 3 8c0 4.5 2 7 7 7zM14 14c2-4.5 4.5-6 7-6 0 4.5-2 7-7 7z" fill="${c}"/>` +
      `<circle cx="12" cy="10" r="2.3" fill="${c}"/>` +
      `<path d="M7.5 21c0-3.5 2-5.5 4.5-5.5s4.5 2 4.5 5.5" ${stroke(c, 2)}/>`,
  ],
  // Form: a flame over a bar, Balthazar's fire (#1455).
  "avatar-of-balthazar": [
    "form",
    (c) =>
      `<path d="M12 3c3.5 3.5 4.5 6 4.5 8.5a4.5 4.5 0 0 1-9 0c0-2.5 1.5-4 2.5-5 .3 2 1 2.5 2 3 0-2.5 0-4.5 0-6.5z" fill="${c}"/>` +
      `<path d="M6 19.5h12" ${stroke(c, 2.2)}/>`,
  ],
  // Form: a hooded skull, Grenth's death (#1455).
  "avatar-of-grenth": [
    "form",
    (c) =>
      `<path d="M6 13a6 6 0 0 1 12 0v3h-2.5v3h-7v-3H6z" fill="${c}"/>` +
      `<circle cx="9.7" cy="13" r="1.4" fill="${C.dervish}"/>` +
      `<circle cx="14.3" cy="13" r="1.4" fill="${C.dervish}"/>`,
  ],
  // Form: a mask, half light and half dark, Lyssa's illusion (#1455).
  "avatar-of-lyssa": [
    "form",
    (c) =>
      `<path d="M5 8c4-1.5 10-1.5 14 0 0 6-3 10-7 10S5 14 5 8z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 7v11c-4 0-7-4-7-10 2.3-.8 4.6-1 7-1z" fill="${c}"/>`,
  ],
  // Enchantment: a chevron chasing a dot with a spark, faster and harder on runners (#1421).
  "harriers-haste": [
    "enchantment",
    (c) =>
      `<path d="M5 7l5 5-5 5" ${stroke(c, 2.2)}/>` +
      `<circle cx="15" cy="12" r="2.2" fill="${c}"/>` +
      `<path d="M19 8l2-2M19 16l2 2M20 12h2" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a shield struck through, armor lost while the signet is
  // activated (#524).
  "healing-signet-armor": [
    "skill-effect",
    (c) =>
      `<path d="M8.5 6.5h7v4c0 2.2-1.8 3.7-3.5 4.8-1.7-1.1-3.5-2.6-3.5-4.8z" ${stroke(c, 1.8)}/>` +
      `<path d="M6.5 16.5l11-11" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: a blade and a plus, hits land harder near Winnowing (#1064).
  winnowing: [
    "skill-effect",
    (c) =>
      `<path d="M5 17L13 9" ${stroke(c, 2.2)}/>` + `<path d="M17 6v6M14 9h6" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: two regeneration arrows, Recuperation's +2 (#1064).
  recuperation: ["skill-effect", (c) => `<path d="M7 13l3-3 3 3M11 13l3-3 3 3" ${stroke(c, 2)}/>`],
  // Skill effect: a roof over a bar, no blow takes more than 10% (#1265).
  shelter: [
    "skill-effect",
    (c) => `<path d="M6 12l6-5 6 5" ${stroke(c, 2.2)}/>` + `<path d="M8 16h8" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: two links, damage taken shared with the spirit (#1265).
  union: [
    "skill-effect",
    (c) =>
      `<circle cx="9.5" cy="12" r="3" ${stroke(c, 2)}/><circle cx="14.5" cy="12" r="3" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: an arrow turned aside, a blocked attack (#1265).
  displacement: ["skill-effect", (c) => `<path d="M5 12h6l3-4M14 8h3M14 8v3" ${stroke(c, 2)}/>`],
  // Skill effect: a body flat on a ground line, held down longer (#1265).
  earthbind: [
    "skill-effect",
    (c) => `<path d="M6 13h12" ${stroke(c, 2.2)}/>` + `<path d="M6 17h12" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: a shield on a ground line, melee blocked inside a ward (#1087).
  "ward-against-melee": [
    "skill-effect",
    (c) =>
      `<path d="M8 5.5h8v4.5c0 2.5-2 4.2-4 5.5-2-1.3-4-3-4-5.5z" ${stroke(c, 2)}/>` +
      `<path d="M5 18.5h14" ${stroke(c, 2.2)}/>`,
  ],
  // Skill effect: two degeneration arrows over a ground line, Well of
  // Suffering's -5 to the foes inside it (#1104).
  "well-of-suffering": [
    "skill-effect",
    (c) =>
      `<path d="M7 8l3 3 3-3M11 8l3 3 3-3" ${stroke(c, 2)}/>` +
      `<path d="M5 18.5h14" ${stroke(c, 2.2)}/>`,
  ],
  // Shout: two chevrons right, the pet bites and runs faster (#1108).
  "call-of-haste": [
    "shout",
    (c) => `<path d="M7 7.5l4.5 4.5L7 16.5M12.5 7.5l4.5 4.5-4.5 4.5" ${stroke(c, 2.2)}/>`,
  ],
  // Shout: a shield with a minus, less damage to the pet (#1108).
  "call-of-protection": [
    "shout",
    (c) =>
      `<path d="M7 5.5h10v5.5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" ${stroke(c, 2)}/>` +
      `<path d="M9.5 11h5" ${stroke(c, 2.2)}/>`,
  ],
  // Shout: two linked rings, half the pet's hurt shared with you (#1108).
  "symbiotic-bond": [
    "shout",
    (c) =>
      `<circle cx="9.5" cy="12" r="3.5" ${stroke(c, 2)}/><circle cx="14.5" cy="12" r="3.5" ${stroke(c, 2)}/>`,
  ],
  // Hex: three degeneration arrows, a phantasm's -5 (#1228).
  "conjure-phantasm": [
    "hex",
    (c) => `<path d="M5 9l2.5 3L10 9M9.5 9l2.5 3 2.5-3M14 9l2.5 3L19 9" ${stroke(c, 2)}/>`,
  ],
  // Hex: a weight hung on a foot, moving 50% slower (#1228).
  "imagined-burden": [
    "hex",
    (c) => `<path d="M12 5v4" ${stroke(c, 2)}/>` + `<path d="M8.5 9h7l2 9h-11z" fill="${c}"/>`,
  ],
  // Hex: a jagged ache over a drop, a deep wound when it ends (#1228).
  "phantom-pain": [
    "hex",
    (c) =>
      `<path d="M5 9l3-3 3 3 3-3 3 3" ${stroke(c, 2)}/>` +
      `<path d="M12 11.5c-1.8 2.4-2.5 3.6-2.5 4.6a2.5 2.5 0 0 0 5 0c0-1-.7-2.2-2.5-4.6z" fill="${c}"/>`,
  ],
  // Hex: a shield closing in on itself, cracked armor when it ends (#1228).
  "shrinking-armor": [
    "hex",
    (c) =>
      `<path d="M8.5 7h7v4.5c0 2.4-1.8 4-3.5 5-1.7-1-3.5-2.6-3.5-5z" ${stroke(c, 2)}/>` +
      `<path d="M12 8.5l-1 3 1.5 1.5-.5 2.5" ${stroke(c, 1.4)}/>`,
  ],
  // Enchantment: a chevron and a broken one, faster now and crippled after (#1228).
  "illusion-of-haste": [
    "enchantment",
    (c) =>
      `<path d="M6 7.5l4.5 4.5L6 16.5" ${stroke(c, 2.4)}/>` +
      `<path d="M13 7.5l3 3M16 13.5l-3 3" ${stroke(c, 2)}/>`,
  ],
  // Hex: a blade crossed out, the next attack hurts and blinds (#1228).
  ineptitude: [
    "hex",
    (c) =>
      `<path d="M12 18.5v-10M8.5 8.5h7M12 8.5v-4" ${stroke(c, 2.2)}/>` +
      `<path d="M6 6l12 12" ${stroke(c, 2)}/>`,
  ],
  // Hex: a limping foot and a degeneration arrow, slowed and draining (#1228).
  "crippling-anguish": [
    "hex",
    (c) =>
      `<path d="M6 17.5h5l2-4" ${stroke(c, 2.2)}/>` +
      `<path d="M14 7l2.5 3L19 7" ${stroke(c, 2)}/>`,
  ],
  // Hex: a dashed ring with a gag bar, the foe cannot cast spells (#1234, #1262).
  "shroud-of-silence": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12" r="6.5" ${stroke(c, 1.8)} stroke-dasharray="3.4 2.6"/>` +
      `<path d="M7.5 12h9" ${stroke(c, 2.6)}/>`,
  ],
  // Hex: a shield cracked open, blows of its caster cannot be blocked (#1234, #1262).
  "expose-defenses": [
    "hex",
    (c) =>
      `<path d="M12 5.5L18 7.8V12c0 3-2.5 5-6 6.5C8.5 17 6 15 6 12V7.8Z" ${stroke(c, 1.6)}/>` +
      `<path d="M12 7.5L10.5 11.5L13.5 13L11.5 16.5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a drop and a chevron, a poison that renews while its foe moves (#1234, #1262).
  "enduring-toxin": [
    "hex",
    (c) =>
      `<path d="M10 6c-2 2.6-3.5 4.4-3.5 6.2a3.5 3.5 0 0 0 7 0C13.5 10.4 12 8.6 10 6z" fill="${c}"/>` +
      `<path d="M15.5 8.5l3 3.5l-3 3.5" ${stroke(c, 2)}/>`,
  ],
  // Hex: a skull, healing on the foe is cut (#1234, #1262).
  "mark-of-death": [
    "hex",
    (c) =>
      `<path d="M12 5.5c-3 0-5 2-5 4.7c0 1.8 1 2.9 2.5 3.6V17h5v-3.2c1.5-.7 2.5-1.8 2.5-3.6c0-2.7-2-4.7-5-4.7z" fill="${c}"/>` +
      `<circle cx="10" cy="10.2" r="1.3" fill="${C.hex}"/><circle cx="14" cy="10.2" r="1.3" fill="${C.hex}"/>`,
  ],
  // Hex: two links and a spike, spirits' attacks hurt more (#1270).
  "painful-bond": [
    "hex",
    (c) =>
      `<circle cx="9.5" cy="13" r="3" ${stroke(c, 2)}/><circle cx="14.5" cy="13" r="3" ${stroke(c, 2)}/>` +
      `<path d="M12 4.5v4" ${stroke(c, 2.2)}/>`,
  ],
  // Hex: a falling tear over a low line, degeneration (#1270).
  lamentation: [
    "hex",
    (c) =>
      `<path d="M12 5c-2 2.8-3.5 4.6-3.5 6.4a3.5 3.5 0 0 0 7 0C15.5 9.6 14 7.8 12 5z" fill="${c}"/>` +
      `<path d="M7 18.5l5-1.5l5 1.5" ${stroke(c, 2)}/>`,
  ],
  // Hex: a barbed line, physical hits hurt more (#1332).
  barbs: [
    "hex",
    (c) =>
      `<path d="M4 12h16" ${stroke(c, 2)}/>` +
      `<path d="M7 12l2-4M11 12l2-4M15 12l2-4M9 12l-2 4M13 12l-2 4M17 12l-2 4" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a cross over a falling line, a miss that hurts (#1332).
  "price-of-failure": [
    "hex",
    (c) =>
      `<path d="M8 5l8 8M16 5l-8 8" ${stroke(c, 2.2)}/>` + `<path d="M12 15v4.5" ${stroke(c, 2)}/>`,
  ],
  // Hex: three falling drops, degeneration on a crowd (#1332).
  suffering: [
    "hex",
    (c) =>
      `<path d="M7 6c-1.2 1.8-2 2.9-2 4a2 2 0 0 0 4 0c0-1.1-.8-2.2-2-4z" fill="${c}"/>` +
      `<path d="M17 6c-1.2 1.8-2 2.9-2 4a2 2 0 0 0 4 0c0-1.1-.8-2.2-2-4z" fill="${c}"/>` +
      `<path d="M12 11c-1.2 1.8-2 2.9-2 4a2 2 0 0 0 4 0c0-1.1-.8-2.2-2-4z" fill="${c}"/>`,
  ],
  // Hex: a plus with a third cut away, less healing (#1332).
  "defile-flesh": [
    "hex",
    (c) =>
      `<path d="M12 5v14M5 12h9" ${stroke(c, 2.6)}/>` + `<path d="M16 12h3" ${stroke(c, 1.4)}/>`,
  ],
  // Hex: a shield struck through, cannot block (#1332).
  "rigor-mortis": [
    "hex",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M5 19L19 5" ${stroke(c, 2.2)}/>`,
  ],
  // Hex: a drop beside a small plus, degeneration and less healing (#1332).
  "lingering-curse": [
    "hex",
    (c) =>
      `<path d="M9 5c-2 2.8-3.5 4.6-3.5 6.4a3.5 3.5 0 0 0 7 0C12.5 9.6 11 7.8 9 5z" fill="${c}"/>` +
      `<path d="M17 13v6M14 16h6" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: a sprout and a plus, each creature made heals you (#1316).
  "boon-of-creation": [
    "enchantment",
    (c) =>
      `<path d="M12 19v-7M12 12c-3 0-5-2-5-5c3 0 5 2 5 5zM12 12c3 0 5-2 5-5c-3 0-5 2-5 5z" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a sprout bursting into rays, lightning round each new creature (#1316).
  "explosive-growth": [
    "enchantment",
    (c) =>
      `<path d="M12 19v-6" ${stroke(c, 2.2)}/><circle cx="12" cy="10" r="2.5" fill="${c}"/>` +
      `<path d="M12 4v2M6.5 6.5l1.5 1.5M17.5 6.5L16 8M5 11h2M17 11h2" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: an open hand holding a plus, allies near each new creature healed (#1316).
  "spirits-gift": [
    "enchantment",
    (c) =>
      `<path d="M5 14c2 0 3 1 4 2h5c1 0 1.5-1.5 0-1.5h-3M5 18h9l5-4" ${stroke(c, 1.8)}/>` +
      `<path d="M13 5v6M10 8h6" ${stroke(c, 2.2)}/>`,
  ],
  // Hex: a barbed line under a spark, any hex or enchantment hurts (#1403).
  "soul-barbs": [
    "hex",
    (c) =>
      `<path d="M4 15h16" ${stroke(c, 2)}/>` +
      `<path d="M7 15l2-3M11 15l2-3M15 15l2-3" ${stroke(c, 1.6)}/>` +
      `<path d="M12 4v5M9.5 6.5h5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a shield with a bolt, the next block hurts (#1403).
  "defile-defenses": [
    "hex",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M13 7l-3 4h4l-3 4" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a plus with rays thrown back, the enchanter is smitten (#1403).
  "scourge-enchantment": [
    "hex",
    (c) =>
      `<path d="M12 8v8M8 12h8" ${stroke(c, 2.4)}/>` +
      `<path d="M5 5l2.5 2.5M19 5l-2.5 2.5M5 19l2.5-2.5M19 19l-2.5-2.5" ${stroke(c, 1.6)}/>`,
  ],
  // Stance: a broken ring, the next hex fails (#1403).
  "hex-breaker": [
    "stance",
    (c) =>
      `<path d="M10 5.3A7 7 0 1 0 18.7 10M14 5.3A7 7 0 0 1 18.7 10" ${stroke(c, 2.2)}/>` +
      `<path d="M11 4l2 3-2 1 2 3" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: icicles under a bar, the cage that slows 66% (#1367, #1440).
  "ice-prison": [
    "hex",
    (c) =>
      `<path d="M4 5h16" ${stroke(c, 2)}/>` +
      `<path d="M5.5 6.5h4L7.5 18zM10 6.5h4L12 19zM14.5 6.5h4L16.5 18z" fill="${c}"/>`,
  ],
  // Hex: a snowflake with ice thrown out round it, the burst round the caster (#1367, #1440).
  "frozen-burst": [
    "hex",
    (c) =>
      `<path d="M12 8v8M8.5 10l7 4M8.5 14l7-4" ${stroke(c, 1.8)}/>` +
      `<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effect: a spear point over a plus, regeneration while Overcast (#1367).
  "ice-spear": [
    "skill-effect",
    (c) =>
      `<path d="M12 4l2.5 5h-5z" fill="${c}"/>` +
      `<path d="M12 9v5M12 15v5M9.5 17.5h5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: an eye and its ghost, half the attacks miss (#1367, #1440).
  "blurred-vision": [
    "hex",
    (c) =>
      `<path d="M3 12c2-3.5 4.5-5 7.5-5s5.5 1.5 7.5 5c-2 3.5-4.5 5-7.5 5S5 15.5 3 12z" ${stroke(c, 1.8)}/>` +
      `<circle cx="10.5" cy="12" r="2" fill="${c}"/>` +
      `<path d="M21 12c-1.4-2.4-2.8-3.8-4.4-4.6" ${stroke(c, 1.4)} stroke-dasharray="1.6 1.8"/>`,
  ],
  // Enchantment: a shield with mist lines across it, armor and speed (#1367, #1440).
  "armor-of-mist": [
    "enchantment",
    (c) =>
      `<path d="M12 3.5l6.5 2.5v5.5c0 3.8-2.8 6.2-6.5 8-3.7-1.8-6.5-4.2-6.5-8V6z" ${stroke(c, 1.8)}/>` +
      `<path d="M8.5 10c1.2-1.4 2.3-1.4 3.5 0s2.3 1.4 3.5 0M8.5 14c1.2-1.4 2.3-1.4 3.5 0s2.3 1.4 3.5 0" ${stroke(c, 1.5)}/>`,
  ],
  // Hex: a stone split in two, it bursts when it ends (#1367, #1440).
  shatterstone: [
    "hex",
    (c) =>
      `<path d="M3.5 10L9 5l2.5 3.5L10 12l1.5 3L5.5 19 3 14z" fill="${c}"/>` +
      `<path d="M14.5 7l6 3.5-1 4.5-5 .5V12l-1-2.5z" fill="${c}"/>`,
  ],
  // Hex: a snowflake in a head with shoulders, 90% slower (#1367, #1440).
  "mind-freeze": [
    "hex",
    (c) =>
      `<circle cx="12" cy="9" r="6" ${stroke(c, 1.8)}/>` +
      `<path d="M12 5.8v6.4M9.2 7.4l5.6 3.2M9.2 10.6l5.6-3.2" ${stroke(c, 1.4)}/>` +
      `<path d="M4.5 21c0-3.5 3-5 7.5-5s7.5 1.5 7.5 5" ${stroke(c, 1.8)}/>`,
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

/** One dagger, tilted about the icon's centre: the three chain marks share it. */
const chainDagger = (/** @type {number} */ tilt) =>
  `<g transform="rotate(${String(tilt)} 12 12)"><path d="M12 2.5l1.6 3.2V14h-3.2V5.7zM8.5 14h7M12 14v4.5"/><circle cx="12" cy="20" r="1.2"/></g>`;

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
  spirit: () =>
    creatureGlyph(
      `<path d="M0-5.6C3-2.4 4.2 0 4.2 2.2A4.2 4.2 0 0 1-4.2 2.2C-4.2 0-2.2-1.2 0-5.6Z" fill="${C.ink}"/>`,
    ),
};

// ---------------------------------------------------------------------------
// Skill icons (#719): one per implemented skill. A profession plate with its
// silhouette as a faint watermark, one glyph from the vocabulary below for the
// skill's primary effect, and a modifier at the bottom right. The type badge
// and the elite frame are drawn by the UI around the icon, not baked in. The
// glyph and modifier are `ink` only: no hue carries a meaning here, only the
// plate's profession tint, which the shapes never depend on.
// ---------------------------------------------------------------------------

/** @param {string} d */
const inkFill = (d) =>
  `<path d="${d}" fill="${C.ink}" stroke="${C.bg}" stroke-width="1" stroke-linejoin="round"/>`;
/** @param {string} d @param {number} [w] */
const inkLine = (d, w = 2.2) => `<path d="${d}" ${stroke(C.ink, w)}/>`;

/** A burst of `n` points around the centre, alternating two radii. @param {number} n */
const burst = (n) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 === 0 ? 9.5 : 4.5;
    return `${i === 0 ? "M" : "L"}${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
  }).join("") + "Z";

/**
 * The sword shifted down and right, with a mark in the freed corner.
 * @param {string} mark
 */
const bladeMark = (mark) =>
  `<g transform="translate(2.5,2.5)">${inkLine("M5.5 18.5L19 5", 2.6)}${inkLine("M7 11.5L12.5 17", 2.4)}${inkLine("M4 20l2-2", 2.6)}</g>` +
  mark;

/**
 * The resurrect figure, scaled and centred on a point.
 * @param {number} cx
 * @param {number} cy
 * @param {number} k
 */
const smallFigure = (cx, cy, k) =>
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
const smallSkull = (cx, cy, k) =>
  `<g transform="translate(${String(cx)},${String(cy)}) scale(${String(k)}) translate(-12,-12)">` +
  inkFill("M12 2.5a8 8 0 0 1 5 14.2V21.5H7V16.7A8 8 0 0 1 12 2.5z") +
  `<circle cx="9" cy="11" r="2" fill="${C.bg}"/><circle cx="15" cy="11" r="2" fill="${C.bg}"/>` +
  `<path d="M10.5 17V21M13.5 17V21" stroke="${C.bg}" stroke-width="1.2"/>` +
  "</g>";

/**
 * A paw print in the box 3..21: a pad and four toes.
 * @param {string} fill
 */
const pawPrint = (fill) =>
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
const flameRing = (inner, outer, width, dot = true) => {
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

const skillGlyph = {
  heal: () => inkFill("M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"),
  fireball: () =>
    `<circle cx="15" cy="9" r="5" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    inkLine("M10.5 12.5L4 19M9 8.5L3.5 11M14 14L11 20"),
  // An orb with a bolt through it: the shot is the orb, the element the bolt.
  "lightning-orb": () =>
    `<circle cx="12" cy="12" r="8" ${stroke(C.ink, 2)}/>` +
    inkLine("M13.5 5.5L9.5 12H14.5L10.5 18.5", 2),
  // A bolt in a line, from above (#918): lightning, not the filled
  // energy bolt.
  lightning: () => inkLine("M15 2.5L8.5 12.5H15.5L9 21.5", 2.6),
  // An ice shard in flight, with its trail (#918).
  shard: () => inkFill("M21 3L18 13L11 6Z") + inkLine("M12.5 11.5L4 20M9 9L5 13M15 15L11 19", 2),
  // A snowflake (#938): the area frozen, not a shard flying.
  snowflake: () => inkLine("M12 3V21M4.2 7.5L19.8 16.5M4.2 16.5L19.8 7.5", 2.4),
  // A blade with a mark in the empty corner above it: a weapon spell, and what it does (#984).
  "blade-plus": () =>
    bladeMark(
      `<circle cx="8" cy="8" r="5" ${stroke(C.ink, 1.8)}/>` +
        inkLine("M8 5.5V10.5M5.5 8H10.5", 1.8),
    ),
  "blade-turn": () =>
    bladeMark(inkLine("M11 6.5A3.5 3.5 0 1 0 8.5 11.5M8.5 11.5L10.5 12M8.5 11.5L9 9.5", 1.8)),
  "blade-fast": () =>
    bladeMark(inkLine("M3.5 5.5L6.5 8.5L3.5 11.5M7.5 5.5L10.5 8.5L7.5 11.5", 1.8)),
  // A blade with a drop struck through above it: a weapon spell that cleanses (#1048).
  "blade-cleanse": () =>
    bladeMark(
      `<path d="M8 3C8 3 4.5 7 4.5 9.2A3.5 3.5 0 0 0 11.5 9.2C11.5 7 8 3 8 3Z" ${stroke(C.ink, 1.5)}/>` +
        inkLine("M3.5 3.5L12 12", 1.6),
    ),
  // A blade with a hook turning back above it: a weapon spell that hits back at the attacker (#1048).
  "blade-hook": () =>
    bladeMark(inkLine("M11.5 4.5H8a2.5 2.5 0 0 0 0 5H10.5M6.5 3L5 4.5L6.5 6", 1.8)),
  // A blade with shards flying off above it: a weapon spell that splinters (#1048).
  "blade-shards": () => bladeMark(inkFill("M3 4L6 3L5.5 6ZM8 6L11 5L10 8.5ZM4 9L7 8.5L6 11.5Z")),
  // Swordsmanship (#1354): a blade with the payoff in the corner above it.
  // Hamstring cripples: a broken leg.
  "blade-limp": () => bladeMark(inkLine("M10 2.5L6 6.5L9.5 9.5L5 13.5", 2.4)),
  // Pure Strike goes through blocks: a shield struck through.
  "blade-pierce": () =>
    bladeMark(
      `<path d="M8 2.5L12.5 4.2V8C12.5 10.6 10.5 11.9 8 13C5.5 11.9 3.5 10.6 3.5 8V4.2Z" ${stroke(C.ink, 1.8)}/>` +
        inkLine("M2.5 2.5L13 13", 2.2),
    ),
  // Gash deepens a bleed: a drop.
  "blade-drop": () =>
    bladeMark(
      `<path d="M8 2.5C8 2.5 3.8 7 3.8 9.6A4.2 4.2 0 0 0 12.2 9.6C12.2 7 8 2.5 8 2.5Z" fill="${C.ink}"/>`,
    ),
  // Final Thrust finishes a foe below half health: a half-filled disc.
  "blade-half": () =>
    bladeMark(
      `<circle cx="8" cy="8" r="5" ${stroke(C.ink, 1.8)}/><path d="M8 3A5 5 0 0 0 8 13Z" fill="${C.ink}"/>`,
    ),
  // Dragon Slash gives adrenaline back: three rising bars.
  "blade-adrenal": () => bladeMark(inkLine("M3.5 13V9M8 13V6M12.5 13V3", 2.6)),
  // Savage Slash interrupts: a burst.
  "blade-burst": () =>
    bladeMark(
      `<g transform="translate(8,8) scale(0.85) translate(-12,-12)">${inkFill(burst(6))}</g>`,
    ),
  // Hundred Blades: three blades fanned from one hilt, swept through the crowd.
  "blades-fan": () =>
    inkLine("M4.5 20L17 4.5M4.5 20L21 11M4.5 20L11 2.5", 2.6) + inkLine("M3 21.5l3-3", 2.8),
  // A sword hilt with a plus on its grip: a weapon spell that mends (#1048).
  hilt: () =>
    inkLine("M5 9.5H19", 2.8) +
    inkLine("M12 9.5V20.5", 4) +
    inkFill("M12 2.5L15 6.5L12 8L9 6.5Z") +
    `<path d="M12 12.5V17.5M9.5 15H14.5" stroke="${C.bg}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
  // A white-hot disc ringed by rays: a flash that blinds (#992).
  flash: () =>
    `<circle cx="12" cy="12" r="4.2" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    inkLine(
      "M12 2.5V6M12 18V21.5M2.5 12H6M18 12H21.5M5.3 5.3L7.8 7.8M16.2 16.2L18.7 18.7M18.7 5.3L16.2 7.8M7.8 16.2L5.3 18.7",
      2,
    ),
  // A cracked ground line with a ring of tremor above it (#992).
  quake: () =>
    inkLine("M2.5 17L7 15L10 19L13.5 14L17 18L21.5 15.5", 2.4) +
    `<path d="M6.5 11A7 7 0 0 1 17.5 11M9.5 7.5A3.5 3.5 0 0 1 14.5 7.5" ${stroke(C.ink, 2)}/>`,
  // A jagged rock dropping straight down onto the ground, streaks above it (#992).
  meteor: () =>
    inkFill("M6 10L10 6.5L15.5 8L17 13L13.5 17L8 16Z") +
    inkLine("M8 3V5M12.5 1.5V4.5M16.5 3V6M3 11V13", 2) +
    inkLine("M2.5 20.5H14M4.5 18.5L6 19.5", 2.2),
  // A scythe: a long haft, the blade curved over its top (#990).
  scythe: () =>
    inkLine("M7 21L16 6", 2.4) + inkFill("M16 6C12 2.5 7 3 3.5 6.5C8 5.5 11.5 6.5 14.5 9Z"),
  // A tornado: bars narrowing to a point, a whirlwind round the caster (#990).
  twister: () => inkLine("M3.5 5H20.5M6 9.5H18M8.5 14H15.5M11 18.5H13.5", 2.4),
  axe: () =>
    inkLine("M5 20L16 7", 2.4) + inkFill("M11 3.5C17 2.5 21.5 5 21 9C20.5 13 16.5 15 14 12.5Z"),
  sword: () =>
    inkLine("M5.5 18.5L19 5", 2.6) + inkLine("M7 11.5L12.5 17", 2.4) + inkLine("M4 20l2-2", 2.6),
  dagger: () =>
    inkLine("M8 16L18.5 5.5", 2.8) +
    inkLine("M5.5 13.5L10.5 18.5", 2.2) +
    inkLine("M4 20l2.5-2.5", 2.4),
  // A broken leg with a blade at the knee: it cripples (#1049).
  limp: () => inkLine("M16 3L11.5 9.5L15 13L10 19", 2.4) + inkFill("M2.5 7.5L9.5 10L4.5 14Z"),
  // A blade with rays bursting from its point: the cripple spreads to those beside it (#1049).
  "dagger-burst": () =>
    inkLine("M4.5 19.5L13 11", 2.6) +
    inkLine("M17 3V6.5M21 7H17.5M19.5 10.5L17 8.5M10.5 5L12.5 7.5M20 3.5L18 5.5", 2) +
    inkFill("M13 11L17 7L15 12.5Z"),
  // Two horns over a falling chevron: a charge that flattens (#1049).
  "ox-horns": () =>
    inkLine("M4 4C4 11 8 13 12 13C16 13 20 11 20 4", 2.6) +
    inkLine("M8.5 16.5L11.5 20L14.5 16.5", 2.4),
  // A spider from above, eight legs: poison from the fall (#1049).
  spider: () =>
    `<circle cx="12" cy="9" r="2.6" fill="${C.ink}"/><ellipse cx="12" cy="14.5" rx="3.6" ry="4.4" fill="${C.ink}"/>` +
    inkLine(
      "M9.5 8L4 4.5M9 10.5L3 10M9 13.5L3.5 16.5M10 17L6 21M14.5 8L20 4.5M15 10.5L21 10M15 13.5L20.5 16.5M14 17L18 21",
      1.8,
    ),
  hammer: () =>
    inkLine("M5 20L14 11", 2.4) +
    `<rect x="11" y="3.5" width="10" height="7" rx="1" transform="rotate(45 16 7)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>`,
  spear: () => inkLine("M12 21V9", 2.4) + inkFill("M12 2.5L16.5 10H7.5Z"),
  // A spearhead on a shaft that is a bolt: a spear thrown as lightning (#934).
  "spear-bolt": () => inkFill("M12 2.5L16.5 10H7.5Z") + inkLine("M12 10L9 14.5L15 16L12 21.5", 2.4),
  // A pennant on a pole: a shout that rallies (#934).
  // The pennant hollow, a cross in it: a rally that heals (#934).
  "banner-cross": () =>
    inkLine("M6 3V21", 2.4) +
    `<path d="M6 4H19.5L15.5 8.75L19.5 13.5H6Z" ${stroke(C.ink, 1.6)}/>` +
    inkFill("M10.5 6.2h2v1.8h1.8v2h-1.8v1.8h-2v-1.8H8.7v-2h1.8z"),
  // A banner with a note on its cloth: a song carried to every ally (#1012).
  "banner-note": () =>
    inkLine("M6 3V21", 2.4) +
    `<path d="M6 4H19.5L15.5 8.75L19.5 13.5H6Z" ${stroke(C.ink, 1.6)}/>` +
    `<ellipse cx="10.3" cy="10.6" rx="1.7" ry="1.3" fill="${C.ink}"/>` +
    inkLine("M11.9 10.6V6.6L14.4 7.6", 1.4),
  banner: () => inkLine("M6 3V21", 2.4) + inkFill("M6 4H19.5L15.5 8.75L19.5 13.5H6Z"),
  // Two chevrons and a plus: allies hurried along and healed as they go (#959).
  "speed-heal": () =>
    inkLine("M3 6L8 12L3 18M9 6L14 12L9 18", 2.4) + inkLine("M19 8V16M15 12H23", 2.4),
  // A hollow shield round a note: a chant that blocks (#959).
  "anthem-shield": () =>
    `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2)}/>` +
    `<ellipse cx="10.5" cy="15.2" rx="2.2" ry="1.7" fill="${C.ink}"/>` +
    inkLine("M12.5 14.8V7.5L16 9.5", 1.8),
  // A sticking plaster: bound wounds, body and soul (#962).
  plaster: () =>
    `<rect x="2" y="7.5" width="20" height="9" rx="3" transform="rotate(-45 12 12)" fill="${C.ink}"/>` +
    `<rect x="8.5" y="7.5" width="7" height="9" transform="rotate(-45 12 12)" fill="${C.bg}" fill-opacity="0.45"/>` +
    `<circle cx="9.5" cy="9.5" r="0.9" fill="${C.bg}"/><circle cx="14.5" cy="14.5" r="0.9" fill="${C.bg}"/>`,
  // A sword with a small plus in its upper left: a heal that waits on a weapon spell (#962).
  "sword-heal": () =>
    inkLine("M7 20.5L20.5 7", 3) +
    inkLine("M8 12.5L14.5 19", 2.6) +
    inkLine("M4.5 20l2.5-2.5", 2.6) +
    inkLine("M6.5 3V9M3.5 6H9.5", 2),
  arrow: () => inkLine("M4 20L15 9", 2.2) + inkFill("M21 3L11.5 6L18 12.5Z"),
  volley: () =>
    [-4.5, 0, 4.5]
      .map(
        (d) =>
          `<g transform="translate(${String(d)},${String(-d)})">${inkLine("M4 18L15 7M10 6.5H15.5V12", 2)}</g>`,
      )
      .join(""),
  interrupt: () => inkFill(burst(6)),
  // An arrow driven down into a ground bar: pinned in place (#981).
  pin: () => inkLine("M12 3V14", 2.4) + inkFill("M12 20.5L7 13H17Z") + inkLine("M4 21.5H20", 2.4),
  // A dagger with a four-point spark at its point: the blow is a critical hit (#1315).
  "dagger-crit": () =>
    inkLine("M8 16L14 10", 2.8) +
    inkLine("M5.5 13.5L10.5 18.5", 2.2) +
    inkLine("M4 20l2.5-2.5", 2.4) +
    inkFill("M17 2.5L18.6 7.4L23.5 9L18.6 10.6L17 15.5L15.4 10.6L10.5 9L15.4 7.4Z"),
  // A shield with the critical spark in it: blocks, renewed by critical hits (#1315).
  "shield-crit": () =>
    `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2)}/>` +
    inkFill("M12 6.5L13.7 10.3L17.5 12L13.7 13.7L12 17.5L10.3 13.7L6.5 12L10.3 10.3Z"),
  // A solid shield: the block stance that pays energy (#1329).
  "shield-stance": () =>
    inkFill("M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z"),
  // A shield outline with one bold bar: the short, plain block (#1329).
  "shield-bar": () =>
    `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.8)}/>` +
    inkLine("M8 11.5H16", 3.4),
  // A shield with an arrow glancing off it: projectiles deflected (#1329).
  "shield-arrow": () =>
    `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.8)}/>` +
    inkLine("M2.5 3L11 9.5", 3) +
    inkFill("M16 13.5L8.5 13L11.5 7Z"),
  // A shield with a blade across it: the blocked attacker is cut (#1329).
  "shield-blade": () =>
    `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.8)}/>` +
    inkLine("M7.5 17L17 7.5", 3.4) +
    inkLine("M8 10.5L13.5 16", 2.8),
  // The spirit post in a halo, being born, with the payout beside it (#1316).
  // Boon of Creation heals and gives energy: a plus.
  "born-plus": () => bornPost() + inkLine("M17 3.5V13.5M12 8.5H22", 2.8),
  // Explosive Growth strikes foes near it: a burst.
  "born-burst": () =>
    bornPost() +
    `<g transform="translate(17,8.5) scale(0.95) translate(-12,-12)">${inkFill(burst(5))}</g>`,
  // Spirit's Gift heals the allies near it: a plus in a ring.
  "born-ring": () =>
    bornPost() +
    `<circle cx="17" cy="8.5" r="5.6" ${stroke(C.ink, 1.8)}/>` +
    inkLine("M17 5.8V11.2M14.3 8.5H19.7", 2),
  // Signet of Creation pays energy: the energy mark.
  "born-energy": () =>
    bornPost() +
    `<g transform="translate(17,8.5) scale(0.95) translate(-12,-12)">${skillGlyph.energy()}</g>`,
  // A shield with a bolt in it: fast and hard to hit (#981).
  "shield-bolt": () =>
    `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2)}/>` +
    inkFill("M13 6L8.5 13H12L11 18L15.5 11H12Z"),
  // Chevrons and a bar, as on the Escape stance (#981).
  retreat: () => inkLine("M3 6L9 12L3 18M10 6L16 12L10 18", 2.5) + inkLine("M20 5V19", 2.6),
  speed: () => inkLine("M4 4L10 12L4 20M11 4L17 12L11 20", 2.5),
  // A fist-sized impact star behind a heavy stroke: any melee blow, the weapon unsaid (#1396).
  blow: () =>
    inkLine("M2.5 2.5L8 8", 3) +
    inkFill("M13 3.5L14.6 8L19 7L15.8 10.5L18 14.5L13.6 12.8L10 16L10.6 11.4L6 9.5L10.4 8.4Z"),
  // A wide arc with a second inside it: a sweep that clears the ground in front (#1396).
  sweep: () =>
    inkLine("M3.5 19C3.5 10 9 4.5 18 4.5", 2.8) + inkLine("M8 19C8 14 11 11 15.5 10.5", 2.2),
  // Three chevrons: a stance that hurries the bearer (#1396).
  rush: () => inkLine("M3 5L9 12L3 19M9.5 5L15.5 12L9.5 19M16 5L22 12L16 19", 2.2),
  // A bull's head, front on, with wide horns and a broad muzzle: the dolyak (#1396).
  dolyak: () =>
    inkLine("M5 11C2.5 10.5 2 7 3.5 4.5M19 11C21.5 10.5 22 7 20.5 4.5", 2.4) +
    inkFill("M6 9L18 9L16.5 15.5L14 20H10L7.5 15.5Z") +
    `<circle cx="9.7" cy="12.5" r="1.1" fill="${C.bg}"/><circle cx="14.3" cy="12.5" r="1.1" fill="${C.bg}"/>`,
  // A heart with a plus: more maximum Health (#1396).
  "heart-plus": () =>
    inkLine("M12 20L5 13a4 4 0 0 1 7-4.7 4 4 0 0 1 7 4.7z", 2) +
    inkLine("M12 10.5V16M9.2 13.2H14.8", 2),
  // A bolt under a ceiling: energy per hit, up to a cap (#1396).
  "bolt-cap": () =>
    inkFill("M13.5 7L8.5 14.5H12L11 21L16 13H12.5Z") + inkLine("M4.5 4.5H19.5", 2.2),
  slow: () => inkLine("M20 4L14 12L20 20M13 4L7 12L13 20", 2.5),
  dash: () => inkLine("M3 7H11M2 12H9M3 17H11", 2) + inkLine("M13 4L21 12L13 20", 2.6),
  // Two small skulls, one raised: a pack of minions (#1112).
  "bone-minions": () => smallSkull(8.5, 14, 0.62) + smallSkull(15.5, 9.5, 0.62),
  // One big horned skull: the horror (#1112).
  "bone-horror": () =>
    smallSkull(12, 13, 0.85) + inkLine("M6.5 8.5C4 7.5 3.5 5 4 3M17.5 8.5C20 7.5 20.5 5 20 3", 2.2),
  // A row of teeth rising from the ground: a trap's jaws, ready to bite (#1129).
  jaws: () =>
    inkLine("M3 19.5H14", 2.2) +
    inkFill("M3 18.5L4.8 6.5L6.6 18.5L8.4 6.5L10.2 18.5L12 6.5L13.8 18.5Z"),
  // A spell, and arcs of it carried on: Arcane Echo copies the next spell (#1136).
  "echo-spell": () =>
    `<circle cx="6" cy="11" r="3.4" fill="${C.ink}"/>` +
    inkLine("M10.5 7A5.5 5.5 0 0 1 10.5 15M14 4A9 9 0 0 1 14 18", 2.2),
  // A plain skill square, and three arcs: Echo copies the next skill of any type (#1136).
  "echo-skill": () =>
    `<rect x="3" y="8.5" width="7" height="7" rx="1" fill="${C.ink}"/>` +
    inkLine(
      "M12.5 8A5 5 0 0 1 12.5 16M16 5.5A8.5 8.5 0 0 1 16 18.5M19.5 3.5A12 12 0 0 1 19.5 20.5",
      2,
    ),
  // A paw print: your pet (#1215).
  paw: () => pawPrint(C.ink),
  // A heart with a paw cut from it: an animal won over (#1215).
  "paw-heart": () =>
    inkFill(
      "M12 21C3.5 14.5 2.5 8.5 6.3 5.7 9 3.8 11.3 5 12 7 12.7 5 15 3.8 17.7 5.7 21.5 8.5 20.5 14.5 12 21Z",
    ) + `<g transform="translate(12,13.2) scale(0.42) translate(-12,-12)">${pawPrint(C.bg)}</g>`,
  // Three gashes: a claw, a strike that tears (#1215).
  claw: () => inkLine("M5.5 4L9.5 20M10.5 4L13 15M15.5 4L18 11", 2.6),
  // Two linked rings: the pet's hurt shared, as the status shows (#1215).
  bond: () =>
    `<circle cx="8.5" cy="12" r="5.5" ${stroke(C.ink, 2.6)}/><circle cx="15.5" cy="12" r="5.5" ${stroke(C.ink, 2.6)}/>`,
  // Two chevrons, a paw behind them: the pet is hurried (#1215).
  "paw-speed": () =>
    `<g transform="translate(14.5,14) scale(0.62) translate(-12,-12)">${pawPrint(C.ink)}</g>` +
    inkLine("M3.5 3.5L9 8.5L3.5 13.5M9.5 3.5L15 8.5L9.5 13.5", 2.2),
  // A shield with a paw cut from it: the pet is guarded (#1215).
  "paw-shield": () =>
    inkFill("M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z") +
    `<g transform="translate(12,12.5) scale(0.5) translate(-12,-12)">${pawPrint(C.bg)}</g>`,
  // A dashed ring (a hex) struck through: the hex is lifted (#1216).
  "hex-cut": () =>
    `<circle cx="12" cy="12" r="8.5" ${stroke(C.ink, 2.2)} stroke-dasharray="4.2 3.2"/>` +
    inkLine("M20 4L4 20", 2.6),
  // A drop with a bolt through it: the condition is smitten (#1216).
  "drop-bolt": () =>
    `<path d="M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z" ${stroke(C.ink, 2)}/>` +
    inkFill("M14 8.5L9.5 14H12.6L10.6 19L15.4 12.8H12.4Z"),
  // A drop struck through inside a rounded square, the enchantment's plate: the drop goes, the enchantment pays (#1216).
  "drop-ward": () =>
    `<rect x="2.5" y="2.5" width="19" height="19" rx="5" ${stroke(C.ink, 2)}/>` +
    `<path d="M12 6.5C12 6.5 7.8 12 7.8 14.5A4.2 4.2 0 0 0 16.2 14.5C16.2 12 12 6.5 12 6.5Z" ${stroke(C.ink, 1.8)}/>` +
    inkLine("M6 6L18 18", 2.2),
  // Two small drops, each struck: two conditions go (#1216).
  "drop-pair": () =>
    [
      [-0.85, 0.9],
      [8.15, 5.9],
    ]
      .map(
        ([x, y]) =>
          `<g transform="translate(${String(x)},${String(y)}) scale(0.7)">` +
          `<path d="M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z" ${stroke(C.ink, 2.6)}/>` +
          inkLine("M4 4L20 20", 3) +
          "</g>",
      )
      .join(""),
  // A plus throwing sparks: each act heals, as the status shows (#1216).
  "plus-sparks": () =>
    inkLine("M12 7.5V18.5M6.5 13H17.5", 3) + inkLine("M4.5 4.5L7 7M19.5 4.5L17 7M12 2.5V4", 2.2),
  // A plus carried on two gusts: health on the wind (#1216).
  "plus-gusts": () =>
    inkLine("M15 3.5V12.5M10.5 8H19.5", 3) +
    inkLine("M3 15.5H13.5A2.4 2.4 0 1 0 11.2 12.8M3 20H10.5A2.4 2.4 0 1 1 8.5 22.6", 2),
  // Three heads in a row under a plus: the whole team healed (#1216).
  "party-heal": () =>
    inkLine("M12 2.5V9.5M8.5 6H15.5", 2.6) +
    [5, 12, 19]
      .map(
        (x) =>
          `<circle cx="${String(x)}" cy="14.5" r="2.4" fill="${C.ink}"/>` +
          `<path d="M${String(x - 3.4)} 21.5C${String(x - 3.4)} 18.5 ${String(x - 1.5)} 17.6 ${String(x)} 17.6S${String(x + 3.4)} 18.5 ${String(x + 3.4)} 21.5Z" fill="${C.ink}"/>`,
      )
      .join(""),
  // A plus with a ripple either side: everyone close by is healed (#1216).
  "plus-ripple": () =>
    inkFill("M10.4 6.5h3.2v3.9h3.9v3.2h-3.9v3.9h-3.2v-3.9H6.5v-3.2h3.9z") +
    inkLine("M3.5 8A6 6 0 0 0 3.5 16M20.5 8A6 6 0 0 1 20.5 16", 2),
  // Three rocks falling in a staggered line, a trail behind each: the shower (#1214).
  "meteor-trio": () =>
    [
      [18, 8],
      [13, 12],
      [8, 16],
    ]
      .map(
        ([x, y]) =>
          `<circle cx="${String(x)}" cy="${String(y)}" r="2.6" fill="${C.ink}"/>` +
          inkLine(
            `M${String((x ?? 0) - 2.5)} ${String((y ?? 0) - 2.5)}L${String((x ?? 0) - 4.5)} ${String((y ?? 0) - 4.5)}`,
            2,
          ),
      )
      .join("") + inkLine("M4 21H20", 2),
  // A heal cross inside the enchantment's ring: the ring is spent for health (#1214).
  "ring-heal": () =>
    `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2)}/>` +
    inkFill("M10.4 7.5h3.2v2.9h2.9v3.2h-2.9v2.9h-3.2v-2.9H7.5v-3.2h2.9z"),
  // A hammer slamming a ground line, bars thrown off either side: the knockdown (#1217).
  "hammer-slam": () =>
    inkLine("M7 4.5L12 11", 2.4) +
    `<rect x="9.5" y="9" width="9" height="6" rx="1" transform="rotate(35 14 12)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    inkLine("M3 19.5H21M5 15.5L3.5 13.5M21 15.5L22 13.5", 2.2),
  // A dashed ring (a hex) with three spikes in it: blows from a weapon cut deeper (#1342).
  "hex-barbs": () =>
    `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
    inkFill("M6 17.5L9.2 7L12.4 17.5ZM11.6 17.5L14.8 9.5L18 17.5Z"),
  // A dashed ring (a hex) with a cross in it: every attack misses (#1342).
  "hex-miss": () =>
    `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
    inkLine("M8.2 8.2L15.8 15.8M15.8 8.2L8.2 15.8", 3),
  // A dashed ring (a hex) with a pyramid of down triangles: health drains from a group (#1342).
  "hex-drain": () =>
    `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
    inkFill("M5.5 6.5H11.5L8.5 12ZM12.5 6.5H18.5L15.5 12ZM9 12.5H15L12 18Z"),
  // A dashed ring (a hex) with a plus and a down arrow: healing is cut (#1342).
  "hex-heal-cut": () =>
    `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
    inkLine("M8.6 6.5V13M5.6 9.75H11.6", 2.6) +
    inkLine("M16.3 7V16M13.5 13L16.3 16.2L19.1 13", 2.6),
  // A dashed ring (a hex) with a cracked shield: the foe cannot block (#1342).
  "hex-nobloc": () =>
    `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
    `<path d="M12 6L17 8V12.2C17 15 14.8 16.6 12 18C9.2 16.6 7 15 7 12.2V8Z" ${stroke(C.ink, 2)}/>` +
    inkLine("M12 8L10.5 12L13.5 13.5L12 17", 1.8),
  // A dashed ring (a hex) with a down triangle and a cut plus: it drains and cuts healing (#1342).
  "hex-drain-cut": () =>
    `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
    inkFill("M5.8 6.8H11L8.4 11.8Z") +
    inkLine("M15.5 6.5V12.5M12.5 9.5H18.5", 2.4) +
    inkLine("M7 16H17", 2.6),
  // A dashed ring (a hex) with a burst in it: the hex bursts on those near (#1217).
  "hex-burst": () =>
    `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2.2)} stroke-dasharray="4.4 3.4"/>` +
    inkFill(burst(5.5)),
  // A drop with an arrow leaving it: health drawn off, as the status shows (#1217).
  "drop-arrow": () =>
    `<path d="M9 5c2.4 3.6 4.2 5.8 4.2 8.5a4.2 4.2 0 0 1-8.4 0C4.8 10.8 6.6 8.6 9 5z" fill="${C.ink}"/>` +
    inkLine("M15 12.5H21M18.5 9.5L21.5 12.5L18.5 15.5", 2.2),
  // A cross with a ring either side: pain passed to who stands near, as the status shows (#1217).
  "pain-cross": () =>
    inkLine("M9 8.5L15 14.5M15 8.5L9 14.5", 2.8) +
    `<circle cx="4.8" cy="17.5" r="2.3" ${stroke(C.ink, 1.8)}/><circle cx="19.2" cy="17.5" r="2.3" ${stroke(C.ink, 1.8)}/>`,
  // An eye with a drop under it: a gaze that drinks (#1217).
  "eye-drop": () =>
    `<path d="M2.5 8.5C5 4.5 8.5 3 12 3S19 4.5 21.5 8.5C19 12.5 15.5 14 12 14S5 12.5 2.5 8.5Z" ${stroke(C.ink, 2)}/>` +
    `<circle cx="12" cy="8.5" r="2.4" fill="${C.ink}"/>` +
    `<path d="M12 15.5C12 15.5 8.6 19 8.6 20.2A3.4 3.4 0 0 0 15.4 20.2C15.4 19 12 15.5 12 15.5Z" fill="${C.ink}"/>`,
  // An arrowhead leaving two hollow ones behind it: a step through the shadows (#1217).
  blink: () =>
    `<path d="M3.5 5L8.5 10L3.5 15Z" ${stroke(C.ink, 1.6)}/>` +
    `<path d="M9 5L14 10L9 15Z" ${stroke(C.ink, 1.6)}/>` +
    inkFill("M15 4.5L21 10L15 15.5Z"),
  // A big drop with a plus cut out of it: health taken by a touch (#1348).
  "drop-touch": () =>
    inkFill("M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z") +
    `<path d="M12 12.5V19M8.8 15.8H15.2" ${stroke(C.bg, 2.2)}/>`,
  // Three small drops: life drawn from up to three foes (#1348).
  "drop-trio": () =>
    [
      [4.2, 0.2],
      [-0.2, 10.2],
      [8.8, 10.2],
    ]
      .map(
        ([x, y]) =>
          `<g transform="translate(${String(x)},${String(y)}) scale(0.58)">${inkFill("M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z")}</g>`,
      )
      .join(""),
  // A drop half full: a strike that drinks above half health (#1348).
  "drop-half": () =>
    `<path d="M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z" ${stroke(C.ink, 2.6)}/>` +
    inkFill("M5.5 12.5H18.5V15A6.5 6.5 0 0 1 5.5 15Z"),
  // A drop with a heavy arrow pointing down: a foe weakened as it is drained (#1348).
  "drop-weak": () =>
    inkFill("M8.5 4C8.5 4 3 10.5 3 14.2A5.5 5.5 0 0 0 14 14.2C14 10.5 8.5 4 8.5 4Z") +
    inkLine("M19 4V14M15 11L19 15.5L23 11", 2.6),
  // A small drop ringed by four barbs: health paid, the foe bleeds (#1348).
  "drop-barbs": () =>
    `<g transform="translate(12,12.5) scale(0.7) translate(-12,-11.5)">${inkFill("M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z")}</g>` +
    inkFill("M12 0.5L15.5 6H8.5ZM12 24L15.5 18.5H8.5ZM0.5 12L6 8.5V15.5ZM23.5 12L18 8.5V15.5Z"),
  // A drop feeding a bolt: health sacrificed for energy (#1348).
  "drop-energy": () =>
    `<g transform="translate(-1.2,2) scale(0.7)">${inkFill("M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z")}</g>` +
    inkFill("M18 2.5L11.5 13H16L14.5 21.5L22.5 9.5H17.5Z"),
  // The step with a plus under it: it heals as it goes (#1349).
  "blink-heal": () =>
    `<path d="M2.5 3L7.5 8L2.5 13Z" ${stroke(C.ink, 1.6)}/>` +
    `<path d="M8 3L13 8L8 13Z" ${stroke(C.ink, 1.6)}/>` +
    inkFill("M14 2.5L20 8L14 13.5Z") +
    inkLine("M5 20.5H13M9 16.5V24.5", 2.4),
  // The step with two fangs under it: it poisons what it leaves behind (#1349).
  "blink-fang": () =>
    `<path d="M2.5 3L7.5 8L2.5 13Z" ${stroke(C.ink, 1.6)}/>` +
    `<path d="M8 3L13 8L8 13Z" ${stroke(C.ink, 1.6)}/>` +
    inkFill("M14 2.5L20 8L14 13.5Z") +
    inkFill("M3 16H8.5L5.75 23ZM9.5 16H15L12.25 23Z"),
  // The step ending at a figure: it goes to an ally (#1349).
  "blink-ally": () =>
    `<path d="M2.5 3L7.5 8L2.5 13Z" ${stroke(C.ink, 1.6)}/>` +
    `<path d="M8 3L13 8L8 13Z" ${stroke(C.ink, 1.6)}/>` +
    `<circle cx="18.5" cy="5.5" r="3" fill="${C.ink}"/>` +
    inkFill("M12.5 15C12.5 10.5 24.5 10.5 24.5 15Z") +
    inkLine("M4 20.5H20", 2.4),
  // A crescent inside a broken shield outline: a calm that ends when the blow lands (#1349).
  "shield-veil": () =>
    `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5" ${stroke(C.ink, 2)}/>` +
    `<path d="M12 2.5L4 5.5V12C4 16.5 7.5 19.5 12 21.5" ${stroke(C.ink, 2)} stroke-dasharray="3 3"/>` +
    inkFill("M13 7a5 5 0 1 0 0 9a4 4 0 0 1 0-9z"),
  // A crescent, a critical spark and a plus: health from each critical hit (#1349).
  "crescent-spark": () =>
    inkFill("M9 2.5a6 6 0 1 0 0 11a4.8 4.8 0 0 1 0-11z") +
    inkFill("M17.5 7L19 11L23 12.5L19 14L17.5 18L16 14L12 12.5L16 11Z") +
    inkLine("M6 17.5V23.5M3 20.5H9", 2.4),
  // Three spikes on the ground: they cripple and bleed what steps on them (#1349).
  caltrops: () =>
    inkFill("M2.5 20H21.5V22.5H2.5Z") +
    inkFill("M2.5 20L5.5 4L8.5 20ZM9 20L12 2L15 20ZM15.5 20L18.5 4L21.5 20Z"),
  // A four-point spark with a short tail: the cheap single bolt of fire (#1397).
  spark: () =>
    inkFill("M15 2L17.2 9.8L24 12L17.2 14.2L15 22L12.8 14.2L6 12L12.8 9.8Z") +
    inkLine("M10 14L3.5 20.5M8.5 9L3 7", 2),
  // A flame over a head and shoulders: a foe set alight (#1397).
  "flame-foe": () =>
    `<circle cx="12" cy="14" r="3" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    `<path d="M4.5 22C4.5 18 7.5 17 12 17S19.5 18 19.5 22Z" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    inkFill(
      "M12.5 1.5c.4 2.6 3.4 3.8 3.4 6.8a3.9 3.9 0 0 1-7.8 0c0-1.8.7-3 1.8-3.8 0 1.4.4 2.1 1.1 2.4-.3-2.1.3-3.9 1.5-5.4z",
    ),
  // A flame over a bare head: the mind burns (#1397).
  "flame-mind": () =>
    `<path d="M12 10C7 10 4.5 13 4.5 16.5C4.5 19 6.5 20.5 9 20.5V22H15V20.5C17.5 20.5 19.5 19 19.5 16.5C19.5 13 17 10 12 10Z" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    inkFill(
      "M12.5 1.5c.4 2.6 3.4 3.8 3.4 6.8a3.9 3.9 0 0 1-7.8 0c0-1.8.7-3 1.8-3.8 0 1.4.4 2.1 1.1 2.4-.3-2.1.3-3.9 1.5-5.4z",
    ),
  // A tight ring of flame points round a dot: fire on all beside you (#1397).
  "flame-ring": () =>
    flameRing(6.5, 10, 2, false) +
    inkFill(
      "M12.5 6.5c.4 2.2 2.8 3.2 2.8 5.6a3.3 3.3 0 0 1-6.6 0c0-1.5.6-2.5 1.5-3.2 0 1.2.3 1.8.9 2-.2-1.8.2-3.2 1.4-4.4z",
    ),
  // Long rays from a dot out to the edge: a big burst round you (#1397).
  "flame-burst": () => flameRing(4, 11.5, 2.4),
  // A target ring with a small flame inside: a burst on the foe (#1397).
  "flame-target": () =>
    `<circle cx="12" cy="12" r="9" ${stroke(C.ink, 2)}/>` +
    inkFill(
      "M12.5 4.5c.4 2.4 3.2 3.6 3.2 6.4a3.7 3.7 0 0 1-7.4 0c0-1.7.7-2.8 1.7-3.6 0 1.3.4 2 1.1 2.3-.3-2 .3-3.7 1.4-5.1z",
    ),
  // Three flames on the ground: a storm that stays where it fell (#1397).
  "flame-field": () =>
    inkLine("M2 21.5H22", 2.2) +
    inkFill(
      "M6 8c.3 2.4 2.8 3.4 2.8 6a3.1 3.1 0 0 1-6.2 0c0-1.5.6-2.5 1.5-3.2 0 1.2.3 1.8.9 2-.2-1.8.2-3.2 1-4.8z",
    ) +
    inkFill(
      "M12 2c.4 3.4 4 5 4 9a4.5 4.5 0 0 1-9 0c0-2.2.9-3.6 2.2-4.6 0 1.7.5 2.6 1.4 3-.4-2.6.4-4.9 1.4-7.4z",
    ) +
    inkFill(
      "M18 8c.3 2.4 2.8 3.4 2.8 6a3.1 3.1 0 0 1-6.2 0c0-1.5.6-2.5 1.5-3.2 0 1.2.3 1.8.9 2-.2-1.8.2-3.2 1-4.8z",
    ),
  // A hammer over a foe lying flat: it hits the downed hardest (#1383).
  "hammer-prone": () =>
    inkLine("M6 3.5L11 9.5", 2.4) +
    `<rect x="8.5" y="7.5" width="9" height="6" rx="1" transform="rotate(35 13 10.5)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    `<circle cx="5.5" cy="18" r="2.4" fill="${C.ink}"/>` +
    inkLine("M9 18H20.5", 3),
  // A hammer slam with a shield beside the impact: it knocks down what blocks it (#1383).
  "hammer-shield": () =>
    inkLine("M7 4.5L12 11", 2.4) +
    `<rect x="9.5" y="9" width="9" height="6" rx="1" transform="rotate(35 14 12)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    inkLine("M3 21H21", 2.2) +
    `<path d="M16 12.5L21.5 14.5V17.5C21.5 19 19 20 16 21C13 20 10.5 19 10.5 17.5V14.5Z" ${stroke(C.ink, 1.8)}/>`,
  // A hammer slam with a turning arrow over it: it answers an attacker (#1383).
  "hammer-counter": () =>
    inkLine("M7 4.5L12 11", 2.4) +
    `<rect x="9.5" y="9" width="9" height="6" rx="1" transform="rotate(35 14 12)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    inkLine("M3 19.5H21", 2.2) +
    inkLine("M14.5 6.5C18.5 3 21.5 6 20.5 10.5M18 9L20.5 11L22.5 8", 2),
  // A hammer slam with two weak chevrons on the ground: it hits what is weakened (#1383).
  // A raised hammer over two weak chevrons, no slam: it weakens what it hits (#1383).
  "hammer-chevrons": () =>
    inkLine("M3.5 12.5L9.5 6.5", 2.4) +
    `<rect x="8" y="1.5" width="9" height="6" rx="1" transform="rotate(45 12.5 4.5)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    inkLine("M11 12.5L16 16.5L21 12.5M11 17.5L16 21.5L21 17.5", 2.2),
  "hammer-weak": () =>
    inkLine("M7 4.5L12 11", 2.4) +
    `<rect x="9.5" y="9" width="9" height="6" rx="1" transform="rotate(35 14 12)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    inkLine("M3 21H21", 2.2) +
    inkLine("M12.5 15.5L16 19L19.5 15.5", 2.6),
  // A hammer slam splitting the ground wide, cracks both ways: it shakes everything near (#1383).
  "hammer-quake": () =>
    inkLine("M7 4.5L12 11", 2.4) +
    `<rect x="9.5" y="9" width="9" height="6" rx="1" transform="rotate(35 14 12)" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    inkLine("M2 19L6 21.5L9.5 18.5L13 21.5L16.5 18.5L19.5 21L22 19", 2.6),
  // A post with a bright head: a spirit planted where it was called (#1217).
  totem: () =>
    inkFill("M9 11H14L14.2 20H8.8Z") + `<circle cx="12" cy="6.5" r="3.8" fill="${C.ink}"/>`,
  // The spirit post, low on the left, shooting a mark up and right: what the
  // mark is says what the spirit does (#1271). Pain only hurts.
  "spirit-pain": () => spiritPost() + inkLine("M19.5 2.5L14 9.5H19L14.5 15.5", 2.4),
  // Shadowsong blinds: an eye.
  "spirit-blind": () =>
    spiritPost() +
    `<path d="M10.5 8.5C12 5.5 14.5 4.5 17 4.5S22 5.5 23.5 8.5C22 11.5 19.5 12.5 17 12.5S12 11.5 10.5 8.5Z" ${stroke(C.ink, 1.8)}/>` +
    `<circle cx="17" cy="8.5" r="2" fill="${C.ink}"/>`,
  // Dissonance interrupts: a burst.
  "spirit-quiet": () =>
    spiritPost() +
    `<g transform="translate(17,8.5) scale(0.55) translate(-12,-12)">${inkFill(burst(6))}</g>`,
  // Disenchantment strips an enchantment: a ring struck through.
  "spirit-strip": () =>
    spiritPost() +
    `<circle cx="17" cy="8.5" r="4.6" ${stroke(C.ink, 2)}/>` +
    inkLine("M12 14L22 3", 2.2),
  // The spirit post split by a crack: an allied spirit destroyed (#1309). With the
  // jagged mark of the attacking spirits: the burst damages and blinds foes.
  "spirit-rupture": () => brokenPost(7) + inkFill("M20.5 1.5L13.5 10H18L14 17L23 7.5H18.5Z"),
  // Two small cracked posts: every spirit near you is spent (#1309).
  "spirit-feast": () =>
    `<g transform="translate(-2.5,0) scale(0.82) translate(2,3)">${brokenPost(7)}</g>` +
    `<g transform="translate(9,0) scale(0.82) translate(2,3)">${brokenPost(7)}</g>`,
  // One cracked post, centred: one spirit destroyed (#1309).
  "spirit-break": () => brokenPost(12),
  // The spirit post under a shield: no blow takes more than a tenth (#1289).
  "spirit-cap": () =>
    spiritPost() +
    `<path d="M17 2.5L22.5 4.5V8.5C22.5 11.5 20.2 13.3 17 14.5C13.8 13.3 11.5 11.5 11.5 8.5V4.5Z" ${stroke(C.ink, 1.9)}/>` +
    inkLine("M14.2 7.2H19.8", 1.9),
  // The spirit post beside two linked rings: the damage is shared (#1289).
  "spirit-share": () =>
    spiritPost() +
    `<circle cx="14.6" cy="8.5" r="3.3" ${stroke(C.ink, 1.9)}/><circle cx="20" cy="8.5" r="3.3" ${stroke(C.ink, 1.9)}/>`,
  // The spirit post and an arrow stopped by a bar: the attack is blocked (#1289).
  "spirit-block": () =>
    spiritPost() +
    inkLine("M10.5 8.5H17M14.5 5.5L17.5 8.5L14.5 11.5", 2) +
    inkLine("M21 3V14", 2.4),
  // The spirit post and an arrow driven into the ground: no knockdown (#1289).
  "spirit-ground": () =>
    spiritPost() +
    inkLine("M17 2.5V9.5M13.8 7L17 10.2L20.2 7", 2) +
    inkLine("M11.5 13.8H22.5", 2.4),
  // A bolt falling on a cracked ground line: a rift opens and strikes (#1319).
  "rift-strike": () =>
    inkFill("M14.5 2L8 11.5H12.5L10 15.5L17 8H12.5Z") +
    inkLine("M3 20L8 17L11.5 20.5L15.5 16.5L21 19.5", 2.4),
  // The spirit post beside a flame: it sets the foe alight (#1319).
  "spirit-burn": () =>
    spiritPost() +
    `<g transform="translate(17,8.5) scale(0.62) translate(-12,-12)">${skillGlyph.flame()}</g>`,
  // The spirit post and a ringed bolt: energy paid by a spirit's strike (#1319).
  "spirit-energy": () =>
    spiritPost() +
    `<circle cx="17" cy="8.5" r="5.6" ${stroke(C.ink, 1.8)}/>` +
    `<g transform="translate(17,8.5) scale(0.4) translate(-12,-12)">${skillGlyph.energy()}</g>`,
  // Two linked rings under a spike: the hex that makes spirits hit harder (#1319).
  "bond-spike": () =>
    `<circle cx="8.5" cy="16" r="4.6" ${stroke(C.ink, 2.2)}/><circle cx="15.5" cy="16" r="4.6" ${stroke(C.ink, 2.2)}/>` +
    inkLine("M12 2.5V9.5", 2.8),
  // A tear over a falling line, a dashed ring around: the hex that drains (#1319).
  "tear-fall": () =>
    `<circle cx="12" cy="12" r="9.5" ${stroke(C.ink, 1.8)} stroke-dasharray="4.4 3.4"/>` +
    `<path d="M12 5.5c-2.4 3-4 5-4 7a4 4 0 0 0 8 0c0-2-1.6-4-4-7z" fill="${C.ink}"/>` +
    inkLine("M7.5 19L12 17.5L16.5 19", 1.8),
  // Three small spirit posts in a row: a signet that calls three (#1319).
  "spirit-trio": () =>
    [4.5, 12, 19.5]
      .map(
        (x) =>
          inkFill(
            `M${String(x - 2)} 12H${String(x + 2)}L${String(x + 2.2)} 21H${String(x - 2.2)}Z`,
          ) + `<circle cx="${String(x)}" cy="7" r="3" fill="${C.ink}"/>`,
      )
      .join(""),
  // The ward's ring and pole, with a blade struck from it: it turns melee (#1217).
  "ward-blade": () =>
    `<ellipse cx="12" cy="17" rx="8.5" ry="4" ${stroke(C.ink, 2.5)}/>` +
    inkLine("M12 17V9", 2.5) +
    inkLine("M5 3.5L11 9.5M19 3.5L13 9.5", 2.2),
  // A flame over a ground line with teeth: a trap that burns (#1217).
  "trap-flame": () =>
    `<g transform="translate(12,9) scale(0.62) translate(-12,-12)">${skillGlyph.flame()}</g>` +
    inkLine("M3 20H21", 2.5) +
    inkLine("M5 20L7 16L9 20M10 20L12 16L14 20M15 20L17 16L19 20", 2),
  // A ring on the ground and light thrown up out of it: a symbol laid down (#1217).
  "ring-rays": () =>
    `<ellipse cx="12" cy="17" rx="9" ry="4.2" ${stroke(C.ink, 2.4)}/>` +
    inkLine("M12 3.5V12M6 6L8.5 12M18 6L15.5 12", 2.4),
  // The well's ring with an arrow sinking into it: drawn from a corpse (#1217).
  "well-sink": () =>
    `<ellipse cx="8.5" cy="17" rx="6" ry="3.4" ${stroke(C.ink, 2.5)}/>` +
    inkLine("M8.5 3.5V12.5M5 9.5L8.5 13L12 9.5", 2.5),
  // The resurrect figure in a ring: a signet's seal, one use (#1081).
  "resurrect-seal": () =>
    `<circle cx="10.5" cy="10.5" r="8" ${stroke(C.ink, 2)}/>` + smallFigure(10.5, 10.5, 0.55),
  // The resurrect figure with two chevrons rushing at it: brought to the caster (#1081).
  "resurrect-arrive": () =>
    smallFigure(9, 13, 0.8) + inkLine("M21 3.5L16.5 7L21 10.5M21 8.5L17.5 11L21 13.5", 1.8),
  // The resurrect figure in a half ring with an arrow: called back (#1081).
  "resurrect-return": () =>
    `<path d="M19.5 6.5A9 9 0 1 0 8 19.5" ${stroke(C.ink, 2)}/>` +
    inkFill("M21.5 3V10H14.5Z") +
    smallFigure(12, 12.5, 0.6),
  // The resurrect figure with a drop of the caster's blood beside it (#1081).
  "resurrect-blood": () =>
    smallFigure(9, 12.5, 0.85) +
    inkFill("M18 2.5C18 2.5 14.5 6.5 14.5 9A3.5 3.5 0 0 0 21.5 9C21.5 6.5 18 2.5 18 2.5Z"),
  // An ankh: life returned, a resurrection (#812).
  resurrect: () =>
    `<ellipse cx="12" cy="7.5" rx="4" ry="4.5" ${stroke(C.ink, 2.2)}/>` +
    inkLine("M12 12V21M6 14.5H18", 2.6),
  energy: () => inkFill("M13 2L5 13.5H11L10 22L19 10H13Z"),
  // Chain Lightning (#461): a jagged bolt through three foes, not the
  // energy bolt, which means energy.
  chain: () =>
    inkLine("M4.5 5L10 10.5L7.5 12.5L12 19L15 12L12.5 10.5L19.5 5.5", 1.8) +
    [
      [4.5, 5],
      [12, 19],
      [19.5, 5.5],
    ]
      .map(
        ([cx, cy]) =>
          `<circle cx="${String(cx)}" cy="${String(cy)}" r="2.6" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>`,
      )
      .join(""),
  // A peak split by a crack: earth that breaks armor (#1034).
  "mountain-crack": () =>
    inkFill("M2 20L9.5 6L13.5 13L16.5 9L22 20Z") +
    `<path d="M9.8 6.5L12 11.5L9.5 14.5L11.5 20" fill="none" stroke="${C.bg}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  // A cloud of grains: dust thrown to blind (#1034).
  dust: () =>
    [
      [7, 8],
      [13, 6],
      [18, 10],
      [10, 13],
      [14, 13.5],
      [6, 17],
      [12, 19],
    ]
      .map(
        ([x, y]) =>
          `<circle cx="${String(x)}" cy="${String(y)}" r="2.2" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>`,
      )
      .join(""),
  // A bramble stem with barbs: thorns (#1034).
  thorns: () =>
    inkLine("M3.5 19.5C8 17 14 12 20.5 4.5", 2.2) +
    inkLine("M7.5 16L6 11M11 13.5L9.5 8.5M15 10.5L14.5 5M9 17.5L12 21M12.5 13L14.5 15", 2.2),
  mountain: () => inkFill("M2 20L9.5 6L13.5 13L16.5 9L22 20Z"),
  cleanse: () =>
    `<path d="M12 3C12 3 5.5 11 5.5 15A6.5 6.5 0 0 0 18.5 15C18.5 11 12 3 12 3Z" ${stroke(C.ink, 2)}/>` +
    inkLine("M4 4L20 20", 2.4),
  armor: () => inkFill("M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z"),
  flame: () =>
    inkFill(
      "M14 3c.6 4 5 6 5 11a7 7 0 0 1-14 0c0-3 1.2-5.2 3-6.4 0 2.3.6 3.5 1.8 4.1-.6-3.5 1.2-7 4.2-8.7z",
    ),
  flask: () =>
    `<path d="M9.5 3H14.5M10.5 3V9L4.5 19Q3.5 21 6 21H18Q20.5 21 19.5 19L13.5 9V3" ${stroke(C.ink, 2)}/>` +
    inkFill("M7.5 15H16.5L19 19.5H5Z"),
  germ: () => germ(C.ink),
  // A head and shoulders with a plus beside it: a heal aimed at another (#996).
  "heal-other": () =>
    `<circle cx="9" cy="12" r="3.4" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    `<path d="M3 21.5C3 17 5.5 15.5 9 15.5S15 17 15 21.5Z" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
    inkLine("M17 3.5V11M13.2 7.2H20.8", 2.6),
  // A plus in a ring of arrow: the blow turned back into a heal (#996).
  "heal-turn": () =>
    `<path d="M18.5 8A8 8 0 1 0 20 12" ${stroke(C.ink, 2.2)}/>` +
    inkFill("M21.5 3.5V10.5H14.5Z") +
    inkLine("M12 8.5V15.5M8.5 12H15.5", 2.4),
  // A dashed ring (a hex) with a bolt through it: a hex smitten (#996).
  "hex-bolt": () =>
    `<circle cx="12" cy="12" r="8.5" ${stroke(C.ink, 2.2)} stroke-dasharray="4.2 3.2"/>` +
    inkLine("M14.5 3.5L9 12.5H15L9.5 20.5", 2.4),
  // A spear with barbs on its shaft: it hooks and bleeds (#1036).
  "spear-barb": () =>
    inkLine("M12 21V9", 2.4) +
    inkFill("M12 2.5L16.5 10H7.5Z") +
    inkLine("M12 18L7.5 14.5M12 14L16.5 10.5", 2),
  // A spear with speed lines trailing it: a toss at a runner (#1036).
  "spear-dash": () =>
    inkLine("M15 21V9", 2.4) + inkFill("M15 2.5L19.5 10H10.5Z") + inkLine("M4 11V17M8 13V20", 2),
  // A shaft whose head is a burst: a shot that breaks a cast (#1018).
  "arrow-burst": () =>
    inkLine("M5 21L16 10", 2.2) +
    inkFill("M22 4L12.5 7L19 13.5Z") +
    `<g transform="translate(9,3) scale(0.5)">${inkFill(burst(5))}</g>`,
  // An arrow through a shield: nothing blocks it (#1018).
  "arrow-pierce": () =>
    `<path d="M12 4L19.5 6.8V12C19.5 16 16.5 18.8 12 20.5C7.5 18.8 4.5 16 4.5 12V6.8Z" ${stroke(C.ink, 1.8)}/>` +
    inkLine("M2.5 21.5L16 8", 2.4) +
    inkFill("M21.5 2.5L12 5.5L18.5 12Z"),
  // A shaft with a flame for a head: a burning arrow (#1018).
  "arrow-flame": () =>
    inkLine("M3.5 20.5L13 11", 2.2) +
    inkFill(
      "M18 2.5c.5 3 3.5 4.3 3.5 7.5a4.7 4.7 0 0 1-9.4 0c0-2 .8-3.5 2-4.3 0 1.5.4 2.3 1.2 2.7-.4-2.3.8-4.7 2.7-5.9z",
    ),
  // Three prongs on a shaft: a trident thrown through water (#1007).
  trident: () => inkLine("M12 21V3M5.5 4V9Q5.5 13 12 13Q18.5 13 18.5 9V4", 2.4),
  // A hawk seen from below, wings swept back (#1007).
  hawk: () =>
    inkFill(
      "M12 2.5L14 6L12.8 9L22 7.5Q20 16 14.5 17.5L15 21.5L12 19.5L9 21.5L9.5 17.5Q4 16 2 7.5L11.2 9L10 6Z",
    ),
  // A rough boulder: a stone thrown (#1007).
  rock: () => inkFill("M5 8L10 3.5L17 4.5L21 10L19 17L12 20.5L5.5 17.5L3.5 12Z"),
  // A crescent: shadow, the cover an assassin heals in (#1001).
  crescent: () => inkFill("M15 3A9 9 0 1 0 15 21A11 11 0 0 1 15 3Z"),
  // A shield hollow above, filled below: it holds when Health is low (#1001).
  "armor-half": () =>
    `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2)}/>` +
    inkFill("M4 13H20C19 17 16 19.5 12 21.5C8 19.5 5 17 4 13Z"),
  // An open eye: it sees the weak spot (#1001).
  eye: () =>
    `<path d="M2.5 12C5 7.5 8.5 5.5 12 5.5S19 7.5 21.5 12C19 16.5 15.5 18.5 12 18.5S5 16.5 2.5 12Z" ${stroke(C.ink, 2.2)}/>` +
    `<circle cx="12" cy="12" r="3.4" fill="${C.ink}"/>`,
  // A dashed ring (a hex) with a gag bar across it: spells are silenced (#1262).
  "hex-mute": () =>
    `<circle cx="12" cy="12" r="8.5" ${stroke(C.ink, 2.2)} stroke-dasharray="4.2 3.2"/>` +
    inkLine("M6.5 12H17.5", 3.2),
  // A shield outline with a crack down its face: the block is gone (#1262).
  "armor-crack": () =>
    `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2)}/>` +
    inkLine("M12 5.5L9.5 10.5L14 13L11 18.5", 2.4),
  // A drop with chevrons beside it: the poison bites for as long as the foe runs (#1262).
  "drop-run": () =>
    inkFill("M9 3C9 3 3.5 9.5 3.5 13A5.5 5.5 0 0 0 14.5 13C14.5 9.5 9 3 9 3Z") +
    inkLine("M15.5 3.5L19.5 7.5L15.5 11.5", 2.4),
  // A skull: the mark of death (#1262).
  "mark-skull": () =>
    inkFill(
      "M11 3C6.8 3 4 5.8 4 9.5C4 12 5.3 13.5 7.5 14.5V19H14.5V14.5C16.7 13.5 18 12 18 9.5C18 5.8 15.2 3 11 3Z",
    ) +
    `<circle cx="8" cy="9.5" r="2" fill="${C.bg}"/><circle cx="14" cy="9.5" r="2" fill="${C.bg}"/>`,
  // A thrown dagger and a star where it lands: the cast is broken (#1262).
  "dagger-stop": () =>
    inkLine("M3 20L12 11", 2.6) +
    inkFill("M12 11L15.5 7.5L13.8 13.2Z") +
    `<g transform="translate(17.5,6.5) scale(0.5) translate(-12,-12)">${inkFill(burst(6))}</g>`,
  // A thrown dagger and a limping line beyond it: the foe is slowed (#1262).
  "dagger-limp": () =>
    inkLine("M3 20L12 11", 2.6) +
    inkFill("M12 11L15.5 7.5L13.8 13.2Z") +
    inkLine("M19 3L16.5 7L20 10L17.5 13", 2.2),
  // An open palm, fingers up: the strike that knocks down (#1262).
  palm: () =>
    inkLine("M5 3.5V10M8.2 2.5V10M11.4 2.5V10M14.6 3.5V10", 2.4) +
    inkFill("M3.5 10H16V15C16 18 14 20.5 11 20.5H8.5C5.5 20.5 3.5 18 3.5 15Z"),

  // A ghost with dark eyes, wavy hem: the phantasm that gnaws (#1243).
  ghost: () =>
    inkFill("M3.5 17.5V9A5.5 5.5 0 0 1 14.5 9V17.5L12.2 15.3L9 17.5L5.8 15.3Z") +
    `<circle cx="6.8" cy="9" r="1.3" fill="${C.bg}"/><circle cx="11.2" cy="9" r="1.3" fill="${C.bg}"/>`,
  // A hung weight: a burden on the foe's legs (#1243).
  weight: () =>
    `<path d="M7 7Q7 3 9.75 3T12.5 7" ${stroke(C.ink, 2.2)}/>` + inkFill("M4.5 7H15L16 14H3.5Z"),
  // A jagged ache over a cross cut: pain now, a deep wound when it ends (#1243).
  "ache-cross": () =>
    inkLine("M3.5 6L7 3.5L10.5 6L14 3.5L17.5 6", 2.2) +
    inkLine("M5.5 10.5L13.5 18.5M13.5 10.5L5.5 18.5", 3),
  // A shield inside its own outline: armor drawing in, cracked when it ends (#1243).
  "armor-shrink": () =>
    `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 1.8)} stroke-dasharray="3.4 2.4"/>` +
    inkFill("M12 7L16 8.6V12.4C16 14.6 14.4 16 12 17.2C9.6 16 8 14.6 8 12.4V8.6Z"),
  // A whole chevron and a broken one: fast now, crippled after (#1243).
  "speed-break": () =>
    inkLine("M3.5 5L10 12L3.5 19", 2.6) + inkLine("M13.5 5L16.5 8.5M16.5 14L13.5 17.5", 2.4),
  // An eye with a slash through it: the next attack is blinded (#1243).
  "eye-slash": () =>
    `<g transform="scale(0.78)"><path d="M2.5 12C5 7.5 8.5 5.5 12 5.5S19 7.5 21.5 12C19 16.5 15.5 18.5 12 18.5S5 16.5 2.5 12Z" ${stroke(C.ink, 2.8)}/>` +
    `<circle cx="12" cy="12" r="3.4" fill="${C.ink}"/></g>` +
    inkLine("M3.5 17L16.5 3.5", 2.6),
  // A limping line over two drain chevrons: slowed and bleeding health (#1243).
  "limp-drain": () =>
    inkLine("M9 3L5 9.5L9 13.5L4 20", 2.8) +
    inkLine("M13 4.5L16.5 8L20 4.5M13 10L16.5 13.5L20 10", 2.2),
  // Two chevrons and a drop outline: faster, and a condition leaves (#1447).
  "haste-clean": () =>
    inkLine("M3 5L8.5 12L3 19M9.5 5L15 12L9.5 19", 2.4) +
    `<path d="M19 7.5c1.8 2.7 3 4.2 3 6a3 3 0 0 1-6 0c0-1.8 1.2-3.3 3-6z" ${stroke(C.ink, 1.9)}/>` +
    inkLine("M15 6L23 21", 2.2),
  // A flame under a halo: holy attacks, and it burns when it ends (#1447).
  "flame-halo": () =>
    `<ellipse cx="12" cy="4.8" rx="6" ry="2.2" ${stroke(C.ink, 2)}/>` +
    inkFill(
      "M12.5 8c3 3 6.5 5.2 6.5 9.5a7 7 0 0 1-14 0c0-2.8 1.2-5 3-6.2 0 2.2.6 3.4 1.8 4-.6-3.3 1-5.6 2.7-7.3z",
    ),
  // A flame beside three rising bars: it burns, and adrenaline comes (#1447).
  "flame-bars": () =>
    inkFill(
      "M8.5 3.5c2.8 2.8 4.5 5 4.5 8.5a5 5 0 0 1-10 0c0-2 .8-3.6 2.2-4.8 0 1.7.5 2.6 1.4 3-.4-2.6.3-4.4 1.9-6.7z",
    ) + inkLine("M15 21v-5M18.5 21V12M22 21V8M3 22H13", 2.2),
  // A chevron running after a dot, a spark off it: faster, and harder on a runner (#1447).
  chase: () =>
    inkLine("M3 5L9.5 12L3 19", 2.6) +
    `<circle cx="15" cy="12" r="2.8" fill="${C.ink}"/>` +
    inkLine("M19.5 6.5L22 4M19.5 17.5L22 20M20.5 12H23", 2),
  // A top bar with three icicles hanging from it: the cage of ice (#1440).
  "ice-cage": () =>
    inkLine("M4 4.5H20", 2.6) + inkFill("M5 6H9.5L7.2 20ZM9.8 6H14.2L12 21ZM14.5 6H19L16.8 13Z"),
  // A snowflake with ice thrown out round it: the cold bursts round the caster (#1440).
  "frost-nova": () =>
    inkLine("M12 7.5V16.5M8.1 9.75L15.9 14.25M8.1 14.25L15.9 9.75", 2.4) +
    inkLine(
      "M12 1.5V4M12 20V22.5M1.5 12H4M20 12H22.5M4.6 4.6L6.4 6.4M17.6 17.6L19.4 19.4M4.6 19.4L6.4 17.6M17.6 6.4L19.4 4.6",
      2.2,
    ),
  // A long spear: a barbed head, a shaft, a fletch (#1440).
  "spear-ice": () =>
    inkLine("M3.5 20.5L14 10", 2.4) +
    inkFill("M21 3L19.5 11.5L12.5 4.5Z") +
    inkLine("M3.5 14.5L9.5 20.5", 2),
  // A spiral from the middle out: the whirlpool that tears a spell away (#1440).
  whirl: () => inkLine("M12 12a2 2 0 0 1 4 0a4 4 0 0 1-8 0a6 6 0 0 1 12 0a8 8 0 0 1-16 0", 2.2),
  // An eye with a ghost of itself beside it: the foe sees double and misses (#1440).
  "eye-blur": () =>
    `<path d="M2 12C4.5 8 7.5 6 11 6S17.5 8 20 12C17.5 16 14.5 18 11 18S4.5 16 2 12Z" ${stroke(C.ink, 2.4)}/>` +
    `<circle cx="11" cy="12" r="2.8" fill="${C.ink}"/>` +
    `<path d="M22 12C19.5 8 17 6 15 5.4" ${stroke(C.ink, 1.8)} stroke-dasharray="2 2.4"/>`,
  // A shield with mist lines drifting across it: armor and speed (#1440).
  "mist-shield": () =>
    `<path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(C.ink, 2.2)}/>` +
    inkLine("M7.5 10c1.5-1.8 3-1.8 4.5 0s3 1.8 4.5 0M7.5 15c1.5-1.8 3-1.8 4.5 0s3 1.8 4.5 0", 2),
  // A stone split in two, chips flying from the crack: it bursts when it ends (#1440).
  "stone-split": () =>
    inkFill("M3 9L9 4L11.5 8L10 12L11.5 15L5 19L2.5 14Z") +
    inkFill("M15 5.5L21 8.5L20 13L14.5 13.5L14.5 10.5L13 8.5Z") +
    inkLine("M15 2L16.5 3.5M22 4L21 5.5", 1.8),
  // A head and shoulders with a snowflake in the head: the mind freezes (#1440).
  "head-frost": () =>
    `<circle cx="12" cy="9" r="6.5" ${stroke(C.ink, 2.2)}/>` +
    inkLine("M12 5.5V12.5M8.9 7.2L15.1 10.8M8.9 10.8L15.1 7.2", 1.8) +
    inkLine("M4 22C4 18 7.5 16.5 12 16.5S20 18 20 22", 2.2),
  // A figure in a god's shape (#1468). Melandru: a branch with two leaves grows from the head.
  "avatar-earth": () =>
    `<circle cx="12" cy="12.5" r="3" fill="${C.ink}"/>` +
    inkLine("M4.5 22C4.5 17.5 7.5 15.5 12 15.5S19.5 17.5 19.5 22", 2.6) +
    inkLine("M12 9.5V6", 1.8) +
    inkFill(
      "M12 6.5C12 3.5 9.5 2 5.5 2.5c0 3 2 4.5 6.5 4zM12 6.5C12 3.5 14.5 2 18.5 2.5c0 3-2 4.5-6.5 4z",
    ),
  // Dwayna: the figure with wings spread behind it.
  "avatar-wings": () =>
    inkFill("M9 11C7 6.5 4.5 5 1.5 5c0 5 2.5 8 7.5 8zM15 11c2-4.5 4.5-6 7.5-6 0 5-2.5 8-7.5 8z") +
    `<circle cx="12" cy="8.5" r="3" fill="${C.ink}"/>` +
    inkLine("M5.5 22C5.5 17.5 8 14.5 12 14.5S18.5 17.5 18.5 22", 2.6),
  // The gain trigger: a plus in the top left corner is what the foe gains; the payoff sits below and right (#1440).
  "gain-barbs": () =>
    inkLine("M5.5 2.5V9.5M2 6H9", 2.2) +
    inkFill("M6.5 21.5L10.5 11L14 21.5ZM12.5 21.5L16.5 9.5L21 21.5Z"),
  "gain-shield": () =>
    inkLine("M5.5 2.5V9.5M2 6H9", 2.2) +
    inkFill("M15 9L21.5 11.5V16C21.5 19 18.5 21 15 22.5C11.5 21 8.5 19 8.5 16V11.5Z") +
    `<path d="M16 12L13 16.5H16.5L14 21" ${stroke(C.bg, 1.8)}/>`,
  "gain-burst": () =>
    inkLine("M5.5 2.5V9.5M2 6H9", 2.2) +
    `<g transform="translate(14.5,15) scale(0.6) translate(-12,-12)">${inkFill(burst(6))}</g>`,
  // The hex trigger is the dashed ring in the corner; the arrow goes back at its caster (#1440).
  "hex-return": () =>
    `<circle cx="6" cy="6" r="3.8" ${stroke(C.ink, 1.8)} stroke-dasharray="2.6 2"/>` +
    inkLine("M21 21L10.5 10.5M10.5 17V10.5H17", 2.4),
};

/** The shared spirit post of the attacking spirits, left of the mark it shoots (#1271). */
const spiritPost = () =>
  inkFill("M4.8 11H9.2L9.4 20H4.6Z") + `<circle cx="7" cy="6.8" r="3.4" fill="${C.ink}"/>`;

/** A spirit post centred on `cx` broken: the head thrown off the stump (#1309). */
const brokenPost = (/** @type {number} */ cx) =>
  `<g transform="translate(${String(cx - 7)},0)">` +
  inkFill("M4.8 14.5H9.2L9.4 20H4.6Z") +
  `<circle cx="5.6" cy="7" r="3.2" fill="${C.ink}"/>` +
  inkLine("M7 11.2L8.4 12.4M9.6 9.6L11 8.4", 1.8) +
  "</g>";

/** The spirit post wearing a halo: a creature at its birth (#1316). */
const bornPost = () => spiritPost() + `<circle cx="7" cy="6.8" r="6" ${stroke(C.ink, 1.8)}/>`;

/** Modifiers, drawn around the bottom right corner on a dark disc. */
const skillModifier = {
  up: () => inkLine("M19 21V15M16.5 17.5L19 15L21.5 17.5", 1.7),
  down: () => inkLine("M19 15V21M16.5 18.5L19 21L21.5 18.5", 1.7),
  // A plus: it heals as it works (#996).
  plus: () => inkLine("M19 15.4V20.6M16.4 18H21.6", 1.7),
  // A small paw: the blow is the pet's (#1215).
  paw: () =>
    `<g transform="translate(19,18) scale(0.3) translate(-12,-11.5)">${pawPrint(C.ink)}</g>`,
  // A half disc: below half Health (#1036).
  half: () =>
    `<circle cx="19" cy="18" r="3.4" ${stroke(C.ink, 1.5)}/><path d="M19 18H15.6A3.4 3.4 0 0 0 22.4 18Z" fill="${C.ink}"/>`,
  // An energy bolt: it takes energy (#1018).
  bolt: () => inkFill("M20 14.2L16.4 18.4H19L18.2 21.8L22 17.4H19.4Z"),
  // A small skull: it works on a corpse (#1075). The modifier for corpse skills.
  corpse: () =>
    inkFill("M19 14.8a3.4 3.4 0 0 1 2.1 6.1V22h-4.2v-1.1A3.4 3.4 0 0 1 19 14.8z") +
    `<circle cx="17.7" cy="18.1" r="0.9" fill="${C.bg}"/><circle cx="20.3" cy="18.1" r="0.9" fill="${C.bg}"/>`,
  less: () => inkLine("M16.5 18H21.5", 2),
  area: () => `<circle cx="19" cy="18" r="3.4" ${stroke(C.ink, 1.6)}/>`,
  clock: () =>
    `<circle cx="19" cy="18" r="3.6" ${stroke(C.ink, 1.5)}/>` + inkLine("M19 16V18H20.8", 1.4),
  stun: () =>
    [16.2, 19, 21.8]
      .map((x) => `<circle cx="${String(x)}" cy="18" r="1.15" fill="${C.ink}"/>`)
      .join(""),
  bleed: () =>
    `<path d="M19 14.6C19 14.6 15.8 18 15.8 19.8A3.2 3.2 0 0 0 22.2 19.8C22.2 18 19 14.6 19 14.6Z" fill="${C.ink}"/>`,
  self: () =>
    `<circle cx="19" cy="18" r="3.4" ${stroke(C.ink, 1.5)}/><circle cx="19" cy="18" r="1.2" fill="${C.ink}"/>`,
  // An hourglass: it acts when its time runs out (#944).
  hourglass: () => inkLine("M16.8 15H21.2L16.8 21H21.2Z", 1.4),
  // A loop: maintained, it lasts until ended (#837).
  upkeep: () =>
    `<path d="M19 18c-1-1.5-3.4-1.5-3.4 0s2.4 1.5 3.4 0 3.4-1.5 3.4 0-2.4 1.5-3.4 0z" ${stroke(C.ink, 1.4)}/>`,
};

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
  /** @type {Record<string, (() => string) | undefined>} */
  const glyphs = skillGlyph;
  /** @type {Record<string, (() => string) | undefined>} */
  const modifiers = skillModifier;
  const glyph = glyphs[row.glyph];
  if (glyph === undefined) throw new Error(`${id}: no glyph "${row.glyph}"`);
  const modifier = row.modifier === undefined ? "" : modifiers[row.modifier];
  if (modifier === undefined) throw new Error(`${id}: no modifier "${String(row.modifier)}"`);
  return svg(
    `<rect x="1" y="1" width="22" height="22" rx="3.5" fill="${plateTint(hue)}" stroke="${hue}" stroke-width="1"/>` +
      (name === undefined
        ? ""
        : `<g opacity="0.2" transform="translate(3,3) scale(0.75)">${profession[name]()}</g>`) +
      `<g transform="translate(1.2,1.2) scale(0.88)">${glyph()}</g>` +
      (modifier === ""
        ? ""
        : `<circle cx="19" cy="18" r="4.6" fill="${C.bg}" fill-opacity="0.85"/>${modifier()}`),
  );
}

/** @type {Record<string, Record<string, string>>} */
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
  ui: Object.fromEntries(Object.entries(ui).map(([k, f]) => [k, svg(f())])),
  projectile: Object.fromEntries(
    Object.entries(projectile).map(([k, parts]) => [k, projectileSprite(parts)]),
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
