// Draws a before/after study for #253: the same 8v8 clump with every name
// shown, as the arena draws it today, and with names only on your target and
// the body under the cursor. It is a design reference for that decision, not
// a game asset.
//
//   node scripts/assets/name-label-study.mjs
//
// Writes docs/art/name-label-study.svg. The geometry mirrors the arena:
// r = 14 bodies, a 34 x 4 health bar r + 12 above the centre, and an 11 px
// monospace name whose bottom is r + 22 above it.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "name-label-study.svg");

/** The palette. Mirrors docs/art/art-direction.md. */
const C = {
  bg: "#0e1116",
  grid: "#1a212c",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  edge: "#0b0f14",
  target: "#ffd866",
  friend: "#59c2ff",
  foe: "#ff7b72",
  heal: "#3fb950",
  low: "#ff7b72",
  barBg: "#202836",
};

const R = 14;

/** @param {number} n */
const f = (n) => String(Math.round(n * 100) / 100);

/**
 * @typedef {{ x: number, y: number, foe: boolean, name: string, hp: number, facing: number }} Body
 */

/**
 * A skirmish line: allies on the left pushing right, foes on the right, the
 * front lines touching. Positions are relative to the panel's centre.
 * @type {Body[]}
 */
const CLUMP = [
  { x: -150, y: -60, foe: false, name: "Kaja Stormborn", hp: 0.9, facing: 0.2 },
  { x: -120, y: 10, foe: false, name: "Ash", hp: 0.55, facing: 0 },
  { x: -160, y: 70, foe: false, name: "Brother Odo", hp: 1, facing: -0.3 },
  { x: -80, y: -30, foe: false, name: "Moe the Bold", hp: 0.3, facing: 0.1 },
  { x: -60, y: 40, foe: false, name: "Liv", hp: 0.8, facing: -0.1 },
  { x: -30, y: -80, foe: false, name: "Teodora Vance", hp: 0.7, facing: 0.4 },
  { x: -20, y: 5, foe: false, name: "You", hp: 0.65, facing: 0 },
  { x: -95, y: 110, foe: false, name: "Rin", hp: 1, facing: -0.5 },
  { x: 25, y: -20, foe: true, name: "Grimwald", hp: 0.45, facing: Math.PI },
  { x: 30, y: 45, foe: true, name: "Sister Ilse", hp: 0.85, facing: Math.PI - 0.2 },
  { x: 60, y: -75, foe: true, name: "Vex", hp: 0.25, facing: Math.PI + 0.3 },
  { x: 85, y: 10, foe: true, name: "Thorne of Ascalon", hp: 1, facing: Math.PI },
  { x: 110, y: 75, foe: true, name: "Odile", hp: 0.6, facing: Math.PI - 0.4 },
  { x: 140, y: -40, foe: true, name: "Bram Ironside", hp: 0.95, facing: Math.PI + 0.1 },
  { x: 165, y: 30, foe: true, name: "Nyx", hp: 0.75, facing: Math.PI },
  { x: 150, y: 115, foe: true, name: "Quill", hp: 1, facing: Math.PI - 0.6 },
];

const YOU = 6;
const TARGET = 8;
const HOVER = 12;

/**
 * @param {number} x
 * @param {number} y
 * @param {string} s
 * @param {{ size?: number, colour?: string, anchor?: string, mono?: boolean }} [o]
 */
const text = (x, y, s, o = {}) =>
  `<text x="${f(x)}" y="${f(y)}" fill="${o.colour ?? C.inkDim}" font-family="${o.mono === true ? "monospace" : "sans-serif"}" font-size="${f(o.size ?? 10)}" text-anchor="${o.anchor ?? "start"}">${s}</text>`;

/**
 * One body as the arena draws it, at (x, y), with its name or not.
 * @param {Body} b
 * @param {number} x
 * @param {number} y
 * @param {{ you: boolean, target: boolean, name: boolean }} o
 */
function body(b, x, y, o) {
  let s = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}" fill="${b.foe ? C.foe : C.friend}"/>`;
  s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R - 0.75)}" fill="none" stroke="${C.edge}" stroke-width="1.5"/>`;
  if (o.you)
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R - 2)}" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
  const tx = x + Math.cos(b.facing) * (R + 3);
  const ty = y + Math.sin(b.facing) * (R + 3);
  for (const [colour, w] of /** @type {const} */ ([
    [C.edge, 4],
    [C.ink, 2],
  ]))
    s += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(tx)}" y2="${f(ty)}" stroke="${colour}" stroke-width="${String(w)}"/>`;
  if (o.target)
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R + 5)}" fill="none" stroke="${C.target}" stroke-width="2"/>`;
  const top = y - R - 12;
  s += `<rect x="${f(x - 17)}" y="${f(top)}" width="34" height="4" fill="${C.barBg}"/>`;
  s += `<rect x="${f(x - 17)}" y="${f(top)}" width="${f(34 * b.hp)}" height="4" fill="${b.hp < 0.35 ? C.low : C.heal}"/>`;
  if (o.name)
    s += text(x, y - R - 24, b.name, { size: 11, colour: C.ink, anchor: "middle", mono: true });
  return s;
}

/**
 * A mouse pointer whose tip is at (x, y).
 * @param {number} x
 * @param {number} y
 */
const cursor = (x, y) =>
  `<path d="M${f(x)} ${f(y)}l0 13 3.5-3.2 2.6 5.6 2.2-1-2.6-5.5 4.8-0.3z" fill="${C.ink}" stroke="${C.edge}" stroke-width="1"/>`;

const PANEL_W = 470;
const PANEL_H = 330;
const GAP = 20;
const TOP = 52;
const W = PANEL_W * 2 + GAP * 3;
const H = TOP + PANEL_H + 40;

/** @type {string[]} */
const parts = [];
parts.push(`<rect width="${f(W)}" height="${f(H)}" fill="${C.bg}"/>`);
parts.push(
  text(GAP, 20, "Name labels in an 8v8 clump (#253), true size.", { size: 12, colour: C.ink }),
  text(GAP, 36, "Same bodies, bars and weapon lines in both. Only the names differ."),
);

/** @type {[string, (i: number) => boolean][]} */
const PANELS = [
  ["Today: every name", () => true],
  [
    "Proposed: your target and the body under the cursor; Alt shows all",
    (i) => i === TARGET || i === HOVER,
  ],
];

PANELS.forEach(([title, showName], p) => {
  const left = GAP + p * (PANEL_W + GAP);
  const cx = left + PANEL_W / 2;
  const cy = TOP + PANEL_H / 2 + 20;
  parts.push(`<g>`);
  parts.push(
    `<rect x="${f(left)}" y="${f(TOP)}" width="${f(PANEL_W)}" height="${f(PANEL_H)}" fill="${C.bg}" stroke="${C.grid}"/>`,
  );
  for (let gx = left + 32; gx < left + PANEL_W; gx += 32)
    parts.push(
      `<line x1="${f(gx)}" y1="${f(TOP)}" x2="${f(gx)}" y2="${f(TOP + PANEL_H)}" stroke="${C.grid}"/>`,
    );
  for (let gy = TOP + 32; gy < TOP + PANEL_H; gy += 32)
    parts.push(
      `<line x1="${f(left)}" y1="${f(gy)}" x2="${f(left + PANEL_W)}" y2="${f(gy)}" stroke="${C.grid}"/>`,
    );
  CLUMP.forEach((b, i) => {
    parts.push(
      body(b, cx + b.x, cy + b.y, { you: i === YOU, target: i === TARGET, name: showName(i) }),
    );
  });
  const hover = CLUMP[HOVER];
  if (hover !== undefined) parts.push(cursor(cx + hover.x + 4, cy + hover.y + 5));
  parts.push(`</g>`);
  parts.push(text(left, TOP + PANEL_H + 18, title, { colour: C.ink }));
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}">${parts.join("")}</svg>\n`;
writeFileSync(outFile, svg);
console.log(`wrote ${outFile} (${String(Buffer.byteLength(svg))} bytes)`);
