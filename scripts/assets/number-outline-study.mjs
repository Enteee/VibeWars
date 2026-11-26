// Draws a before/after study of damage and heal numbers in melee: the
// target's numbers rise beside it, right of its bar, which in melee is where
// the attacker stands. They cross the attacker's body, health bar and name.
// It is a design reference, not a game asset.
//
//   node scripts/assets/number-outline-study.mjs
//
// Writes docs/art/number-outline-study.svg. The geometry mirrors the arena:
// r = 14 bodies 30 apart, a 34 x 4 health bar r + 12 above the centre, an
// 11 px monospace name whose bottom is r + 22 above it, and numbers
// left-aligned at x = r + 4, stacked 14 apart, 13 px, 11 px for weapon hits
// at 0.8 alpha.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "number-outline-study.svg");

/** The palette. Mirrors docs/art/art-direction.md and arena-scene.ts. */
const C = {
  bg: "#0e1116",
  grid: "#1a212c",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  edge: "#0b0f14",
  friend: "#59c2ff",
  foe: "#ff7b72",
  barFill: "#7ee787",
  barBg: "#11161d",
  damage: "#ff7b72",
  heal: "#7ee787",
};

const R = 14;

/** @param {number} n */
const f = (n) => String(Math.round(n * 100) / 100);

/**
 * @param {number} x
 * @param {number} y
 * @param {string} s
 * @param {{ size?: number, colour?: string, anchor?: string, mono?: boolean, outline?: boolean, alpha?: number }} [o]
 */
const text = (x, y, s, o = {}) =>
  `<text x="${f(x)}" y="${f(y)}" fill="${o.colour ?? C.inkDim}" font-family="${o.mono === true ? "monospace" : "sans-serif"}" font-size="${f(o.size ?? 10)}" text-anchor="${o.anchor ?? "start"}"${o.alpha === undefined ? "" : ` opacity="${f(o.alpha)}"`}${o.outline === true ? ` stroke="${C.edge}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"` : ""}>${s}</text>`;

/**
 * One living body as the arena draws it, centred on (x, y).
 * @param {number} x
 * @param {number} y
 * @param {boolean} foe
 * @param {string} name
 * @param {number} hp
 * @param {number} facing
 */
function body(x, y, foe, name, hp, facing) {
  let s = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}" fill="${foe ? C.foe : C.friend}"/>`;
  s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R - 0.75)}" fill="none" stroke="${C.edge}" stroke-width="1.5"/>`;
  const tx = x + Math.cos(facing) * (R + 3);
  const ty = y + Math.sin(facing) * (R + 3);
  for (const [colour, w] of /** @type {const} */ ([
    [C.edge, 4],
    [C.ink, 2],
  ]))
    s += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(tx)}" y2="${f(ty)}" stroke="${colour}" stroke-width="${String(w)}"/>`;
  const top = y - R - 12;
  s += `<rect x="${f(x - 17)}" y="${f(top)}" width="34" height="4" fill="${C.barBg}"/>`;
  s += `<rect x="${f(x - 17)}" y="${f(top)}" width="${f(34 * hp)}" height="4" fill="${hp < 0.35 ? C.foe : C.barFill}"/>`;
  s += text(x, y - R - 22, name, { size: 11, colour: C.ink, anchor: "middle", mono: true });
  return s;
}

/**
 * Aria takes a burst from Vex, who stands against her right side. Her
 * three numbers, bottoms 14 apart, cross his body, his full bar and his name.
 * @param {boolean} outline
 */
function scene(outline) {
  let s = body(0, 0, false, "Aria", 0.6, 0);
  s += body(2 * R + 2, 0, true, "Vex", 1, Math.PI);
  /** @type {[number, string, string, boolean][]} */
  const numbers = [
    [-6, "-12", C.damage, true],
    [-20, "+30", C.heal, false],
    [-34, "-56", C.damage, false],
  ];
  for (const [bottom, s2, colour, light] of numbers)
    s += text(R + 4, bottom, s2, {
      size: light ? 11 : 13,
      colour,
      mono: true,
      outline,
      ...(light ? { alpha: 0.8 } : {}),
    });
  return s;
}

const PANEL_W = 330;
const PANEL_H = 250;
const GAP = 20;
const TOP = 52;
const W = PANEL_W * 2 + GAP * 3;
const H = TOP + PANEL_H + 40;

/** @type {string[]} */
const parts = [];
parts.push(`<rect width="${f(W)}" height="${f(H)}" fill="${C.bg}"/>`);
parts.push(
  text(GAP, 20, "Damage and heal numbers in melee: true size, then 3x.", {
    size: 12,
    colour: C.ink,
  }),
  text(GAP, 36, "Aria's numbers rise right of her bar, over Vex's body, full bar and name."),
);

/** @type {[string, boolean][]} */
const PANELS = [
  ["Today: plain text, 1.0 to 1.9:1 over bar, body and name", false],
  ["Proposed: a 3 px edge outline, 7.6:1 and up anywhere", true],
];

PANELS.forEach(([title, outline], p) => {
  const left = GAP + p * (PANEL_W + GAP);
  parts.push(
    `<rect x="${f(left)}" y="${f(TOP)}" width="${f(PANEL_W)}" height="${f(PANEL_H)}" fill="${C.bg}" stroke="${C.grid}"/>`,
  );
  parts.push(`<g transform="translate(${f(left + 50)} ${f(TOP + 80)})">${scene(outline)}</g>`);
  parts.push(
    `<g transform="translate(${f(left + 120)} ${f(TOP + 195)}) scale(3)">${scene(outline)}</g>`,
  );
  parts.push(text(left, TOP + PANEL_H + 18, title, { colour: C.ink }));
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}">${parts.join("")}</svg>\n`;
writeFileSync(outFile, svg);
console.log(`wrote ${outFile} (${String(Buffer.byteLength(svg))} bytes)`);
