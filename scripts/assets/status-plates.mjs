// The plate of each status category, and the svg frame every icon shares
// (#2404). Split out of icons.mjs so plate-check.mjs can rasterise a plate
// without running the generator.

import { C } from "./icon-kit.mjs";

/** @typedef {import("./icon-kit.mjs").Category} Category */

/** @param {string} body */
export const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${body}</svg>\n`;

/** @type {Readonly<Record<Category, string>>} */
export const PLATES = {
  stance: `<path d="M12 1L23 9l-4 14H5L1 9z" fill="${C.stance}" stroke="${C.stance}" stroke-width="1" stroke-linejoin="round"/>`,
  condition: `<circle cx="12" cy="12" r="11" fill="${C.condition}"/>`,
  hex: `<path d="M12 0.5L23.5 12 12 23.5 0.5 12z" fill="${C.hex}"/>`,
  enchantment: `<rect x="1" y="1" width="22" height="22" rx="5" fill="${C.enchantment}"/>`,
  preparation: `<path d="M12 1L23.5 22H0.5z" fill="${C.preparation}" stroke="${C.preparation}" stroke-width="1" stroke-linejoin="round"/>`,
  glyph: `<path d="M12 23L23.5 2H0.5z" fill="${C.glyph}" stroke="${C.glyph}" stroke-width="1" stroke-linejoin="round"/>`,
  shout: `<path d="M6.5 2h11l5.5 10-5.5 10h-11L1 12z" fill="${C.ink}"/>`,
  chant: `<path d="M3 1h18v22l-9-5-9 5z" fill="${C.ink}"/>`,
  // The chant's banner with a swallowtail foot: the banner, answered (#1482).
  echo: `<path d="M3 1h18v22l-4.5-4.5L12 23l-4.5-4.5L3 23z" fill="${C.ink}"/>`,
  "weapon-spell": `<path d="M1.5 1h21v10c0 6.5-5 10-10.5 12.5C6.5 21 1.5 17.5 1.5 11z" fill="${C.weaponSpell}"/>`,
  // An urn: a Ritualist's ashes, held (#1434).
  item: `<path d="M7 1h10v3l3 4v11l-3 4H7l-3-4V8l3-4z" fill="${C.ink}"/>`,
  form: `<path d="M7.5 1h9L23 7.5v9L16.5 23h-9L1 16.5v-9z" fill="${C.dervish}"/>`,
  "skill-effect": `<rect x="0.5" y="4" width="23" height="16" rx="8" fill="${C.inkDim}"/>`,
};
