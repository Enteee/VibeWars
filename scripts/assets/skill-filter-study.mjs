// Draws a study of the skill library's filters (#2459 mockups): the filter
// chips take five rows of a 360 px panel. A design reference, not a game
// asset; study, not decided.
//
//   node scripts/assets/skill-filter-study.mjs
//
// Writes docs/art/skill-filter-study.svg: the library today, then A, B, C.
// Palette and type mirror apps/web/src/styles.css (monospace).
//   A: one scrolling row of chips, the pressed ones first, and a "more" button.
//   B: one "Filters" button opens a popover; what is on shows as removable tags.
//   C: search plus compact dropdowns (Type, Profession) and Elite; tags below.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "docs",
  "art",
  "skill-filter-study.svg",
);

const C = {
  bg: "#0e1116",
  panel: "#161b22",
  line: "#2b3440",
  ink: "#d7dee8",
  dim: "#7d8899",
  accent: "#59c2ff",
  elite: "#d4a72c",
};
const TYPES = [
  "attack",
  "spell",
  "enchantment",
  "hex",
  "signet",
  "shout",
  "stance",
  "preparation",
  "glyph",
  "chant",
  "echo",
  "weapon spell",
  "nature ritual",
  "binding ritual",
  "ward",
  "well",
  "item spell",
  "trap",
  "pet attack",
  "form",
  "skill",
];
const ON = new Set(["hex", "spell"]);
const W = 360;
const H = 600;
const GAP = 40;

/** @param {string} s */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
/** @param {number} x @param {number} y @param {number} w @param {number} h @param {string} fill @param {string} stroke @param {number} [r] */
const box = (x, y, w, h, fill, stroke, r = 4) =>
  `<rect x="${String(x)}" y="${String(y)}" width="${String(w)}" height="${String(h)}" rx="${String(r)}" fill="${fill}" stroke="${stroke}"/>`;
/** @param {number} x @param {number} y @param {string} s @param {number} [size] @param {string} [fill] @param {string} [anchor] */
const text = (x, y, s, size = 12, fill = C.ink, anchor = "start") =>
  `<text x="${String(x)}" y="${String(y)}" font-size="${String(size)}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

/** A chip at x,y; returns its svg and width. @param {number} x @param {number} y @param {string} label @param {boolean} on */
const chip = (x, y, label, on) => {
  const w = Math.round(label.length * 6.6 + 18);
  return {
    w,
    svg:
      box(x, y, w, 20, "none", on ? C.accent : C.line, 10) +
      text(x + w / 2, y + 14, label, 11, on ? C.accent : C.dim, "middle"),
  };
};

/** Chips wrapped into rows inside [x, x+width); returns svg and the y below. @param {string[]} labels @param {number} x @param {number} y @param {number} width */
const wrapChips = (labels, x, y, width) => {
  let cx = x;
  let cy = y;
  let out = "";
  for (const l of labels) {
    const c = chip(cx, cy, l, ON.has(l));
    if (cx + c.w > x + width && cx > x) {
      cx = x;
      cy += 26;
      out += chip(cx, cy, l, ON.has(l)).svg;
      cx += c.w + 5;
    } else {
      out += c.svg;
      cx += c.w + 5;
    }
  }
  return { svg: out, y: cy + 26 };
};

/** The search field, Elite toggle. @param {number} y @param {number} fieldW */
const searchRow = (y, fieldW, elite = true) =>
  box(12, y, fieldW, 28, C.bg, C.line) +
  text(22, y + 18, "Search names and text", 11, C.dim) +
  (elite
    ? box(12 + fieldW + 10, y + 8, 12, 12, "none", C.dim, 2) +
      text(12 + fieldW + 28, y + 18, "Elite", 11, C.dim)
    : "");

/** The library's skill cards from y down to the panel's foot. @param {number} y */
const cards = (y) => {
  const rows = [
    ["Healing Breeze", "Spell", "#56d4dd"],
    ["Orison of Healing", "Spell", "#c3e88d"],
    ["Reversal of Fortune", "Spell", "#d2a8ff"],
    ["Dwayna's Kiss", "Enchantment", "#e3b341"],
    ["Smite Hex", "Spell", "#f778ba"],
    ["Remove Hex", "Spell", "#56d4dd"],
  ];
  let out =
    text(12, y + 12, "Healing Prayers  4 / 12", 11, C.dim) +
    `<path d="M12 ${String(y + 18)}H${String(W - 12)}" stroke="${C.line}"/>`;
  let cy = y + 26;
  for (const [name, type, col] of rows) {
    if (cy + 44 > H - 8) break;
    out += box(12, cy, W - 24, 40, C.bg, C.line) + box(18, cy + 6, 28, 28, col ?? C.dim, "none", 4);
    out +=
      text(54, cy + 18, name ?? "", 12) + text(54, cy + 32, `${type ?? ""}  5 energy`, 10, C.dim);
    cy += 46;
  }
  return out;
};

/** A panel frame with its caption, tabs and a body drawn by `body(y)`. @param {number} x @param {string} title @param {string} sub @param {(y: number) => string} body */
const panel = (x, title, sub, body) =>
  `<g transform="translate(${String(x)},60)">` +
  box(0, 0, W, H, C.panel, C.line) +
  text(12, 24, "Skills", 12, C.accent) +
  text(66, 24, "Attributes", 12, C.dim) +
  body(36) +
  `</g>` +
  text(x, 30, title, 15, C.ink) +
  text(x, 48, sub, 11, C.dim);

/** Today. @param {number} y */
const current = (y) => {
  const c = wrapChips(TYPES, 12, y + 38, W - 24);
  return (
    searchRow(y, W - 100) +
    c.svg +
    box(12, c.y + 2, 12, 12, "none", C.dim, 2) +
    text(30, c.y + 12, "Show skills not in the game yet", 11, C.dim) +
    cards(c.y + 26)
  );
};

/** A: one row of chips. @param {number} y */
const a = (y) => {
  const order = [...TYPES.filter((t) => ON.has(t)), ...TYPES.filter((t) => !ON.has(t))];
  let x = 12;
  let row = "";
  for (const l of order) {
    const c = chip(x, y + 38, l, ON.has(l));
    if (x + c.w > W - 64) break;
    row += c.svg;
    x += c.w + 5;
  }
  const fade = `<rect x="${String(W - 96)}" y="${String(y + 36)}" width="32" height="24" fill="url(#fade)"/>`;
  const more =
    box(W - 58, y + 38, 46, 20, "none", C.accent, 10) +
    text(W - 35, y + 52, "+ 17 ▾", 11, C.accent, "middle");
  return (
    searchRow(y, W - 100) +
    row +
    fade +
    more +
    text(12, y + 76, "Hex, Spell  ·  clear", 10, C.dim) +
    cards(y + 84)
  );
};

/** B: a popover. @param {number} y */
const b = (y) => {
  const btn =
    box(W - 98, y, 86, 28, "none", C.accent) +
    text(W - 55, y + 18, "Filters · 3", 11, C.accent, "middle");
  const tags =
    chip(12, y + 38, "hex ×", true).svg +
    chip(66, y + 38, "spell ×", true).svg +
    chip(128, y + 38, "elite ×", true).svg;
  const pop =
    box(12, y + 66, W - 24, 266, C.bg, C.accent, 6) +
    text(24, y + 86, "Skill type", 11, C.dim) +
    wrapChips(TYPES, 24, y + 94, W - 48).svg +
    text(24, y + 266, "Show", 11, C.dim) +
    box(24, y + 274, 12, 12, "none", C.dim, 2) +
    text(42, y + 284, "Elite only", 11, C.ink) +
    box(120, y + 274, 12, 12, "none", C.dim, 2) +
    text(138, y + 284, "Not in the game yet", 11, C.ink) +
    box(W - 100, y + 296, 64, 22, C.accent, "none", 4) +
    text(W - 68, y + 311, "Done", 11, C.bg, "middle");
  return (
    box(12, y, W - 112, 28, C.bg, C.line) +
    text(22, y + 18, "Search names and text", 11, C.dim) +
    btn +
    tags +
    cards(y + 342) +
    pop
  );
};

/** C: compact dropdowns. @param {number} y */
const c = (y) => {
  const dd = (
    /** @type {number} */ x,
    /** @type {number} */ w,
    /** @type {string} */ label,
    /** @type {boolean} */ on,
  ) =>
    box(x, y + 38, w, 24, C.bg, on ? C.accent : C.line) +
    text(x + 8, y + 54, label, 11, on ? C.accent : C.dim) +
    text(x + w - 14, y + 54, "▾", 11, on ? C.accent : C.dim);
  const menu =
    box(12, y + 66, 150, 164, C.panel, C.accent, 4) +
    ["Attack", "Spell  ✓", "Enchantment", "Hex  ✓", "Signet", "Shout", "Stance"]
      .map((s, i) => text(22, y + 84 + i * 19, s, 11, s.includes("✓") ? C.accent : C.ink))
      .join("") +
    text(22, y + 222, "type to jump…  14 more", 10, C.dim);
  return (
    searchRow(y, W - 100) +
    dd(12, 104, "Type · 2", true) +
    dd(122, 104, "Profession", false) +
    dd(236, 112, "Unreleased", false) +
    cards(y + 74) +
    menu
  );
};

const total = 4 * W + 3 * GAP + 2 * 20;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${String(total)}" height="${String(H + 80)}" viewBox="-20 0 ${String(total)} ${String(H + 80)}" font-family="monospace">` +
  `<defs><linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="${C.panel}" stop-opacity="0"/><stop offset="1" stop-color="${C.panel}"/></linearGradient></defs>` +
  `<rect x="-20" width="${String(total)}" height="${String(H + 80)}" fill="${C.bg}"/>` +
  panel(0, "Today", "five rows of type chips", current) +
  panel(W + GAP, "A: one row", "scrolls; pressed first; + opens all", a) +
  panel(2 * (W + GAP), "B: popover", "one button; tags show what is on", b) +
  panel(3 * (W + GAP), "C: dropdowns", "Type, Profession, Elite in one row", c) +
  `</svg>\n`;
writeFileSync(outFile, svg);
