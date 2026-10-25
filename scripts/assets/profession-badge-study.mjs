// Draws a study of where an arena player could show their profession
// (#166, operator question Q25: one profession or both?). It is a design
// reference for that decision, not a game asset.
//
//   node scripts/assets/profession-badge-study.mjs
//
// Writes docs/art/profession-badge-study.svg. Reads the profession glyphs
// from apps/web/public/icons/profession/, so run scripts/assets/icons.mjs
// first if they changed. In the arena colour means team, so every glyph is
// redrawn in `ink`, never in its profession colour.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const iconDir = join(root, "apps", "web", "public", "icons", "profession");
const outFile = join(root, "docs", "art", "profession-badge-study.svg");

/** The palette. Mirrors docs/art/art-direction.md. */
const C = {
  bg: "#0e1116",
  grid: "#1a212c",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  edge: "#0b0f14",
  friend: "#59c2ff",
  foe: "#ff7b72",
  heal: "#2f8f5b",
  barBg: "#202836",
};

/** Body radius, as in the game. */
const R = 14;

const PROFESSIONS = /** @type {const} */ ([
  ["warrior", "W"],
  ["ranger", "R"],
  ["monk", "Mo"],
  ["necromancer", "N"],
  ["mesmer", "Me"],
  ["elementalist", "E"],
  ["assassin", "A"],
  ["ritualist", "Rt"],
  ["paragon", "P"],
  ["dervish", "D"],
]);

/** @param {number} n */
const f = (n) => String(Math.round(n * 100) / 100);

/**
 * A profession glyph's inner SVG with every fill and stroke recoloured: the
 * shape in `colour`, its cut-outs in `hole`.
 * @param {string} name
 * @param {string} colour
 * @param {string} hole
 */
function glyph(name, colour, hole) {
  const src = readFileSync(join(iconDir, `${name}.svg`), "utf8");
  const inner = src.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  // Every icon uses its own hex and #161b22 (`plate`) for its cut-outs.
  return inner
    .split("#161b22")
    .map((piece) => piece.replace(/#[0-9a-f]{6}/g, colour))
    .join(hole);
}

/**
 * A glyph `size` px square, its top-left at (x, y).
 * @param {string} name
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} colour
 * @param {string} [hole]
 */
const place = (name, x, y, size, colour, hole = C.bg) =>
  `<g transform="translate(${f(x)},${f(y)}) scale(${f(size / 24)})">${glyph(name, colour, hole)}</g>`;

/**
 * @param {number} x
 * @param {number} y
 * @param {string} s
 * @param {{ size?: number, colour?: string, anchor?: string, mono?: boolean }} [o]
 */
const text = (x, y, s, o = {}) =>
  `<text x="${f(x)}" y="${f(y)}" fill="${o.colour ?? C.inkDim}" font-family="${o.mono === true ? "monospace" : "sans-serif"}" font-size="${f(o.size ?? 10)}" text-anchor="${o.anchor ?? "start"}">${s}</text>`;

/** Width of an 11 px monospace name, as the arena draws it. */
const nameWidth = (/** @type {string} */ s) => s.length * 6.6;

/**
 * One actor with its health bar and name, as the arena draws them today, plus
 * a profession badge in one of the three placements.
 * @param {number} x
 * @param {number} y
 * @param {"A" | "B" | "C"} option
 * @param {string} primary
 * @param {string} secondary
 * @param {string} team
 * @param {string} name
 */
function actor(x, y, option, primary, secondary, team, name) {
  let s = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}" fill="${team}"/>`;
  s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R - 0.75)}" fill="none" stroke="${C.edge}" stroke-width="1.5"/>`;
  // Health bar, 34 x 4, its top at r + 12 above the centre.
  s += `<rect x="${f(x - 17)}" y="${f(y - R - 12)}" width="34" height="4" fill="${C.barBg}"/>`;
  s += `<rect x="${f(x - 17)}" y="${f(y - R - 12)}" width="24" height="4" fill="${C.heal}"/>`;
  const baseline = y - R - 22 - 2;
  const nameMid = y - R - 22 - 5.5;
  if (option === "C") {
    // On the body, dark, under the weapon line, which starts at the centre.
    s += place(primary, x - 6, y - 6, 12, C.edge, team);
    s += `<path d="M${f(x)} ${f(y)}H${f(x + R + 3)}" stroke="${C.edge}" stroke-width="4"/>`;
    s += `<path d="M${f(x)} ${f(y)}H${f(x + R + 3)}" stroke="${C.ink}" stroke-width="2"/>`;
    s += text(x, baseline, name, { size: 11, colour: C.ink, anchor: "middle", mono: true });
    return s;
  }
  s += `<path d="M${f(x)} ${f(y)}H${f(x + R + 3)}" stroke="${C.edge}" stroke-width="4"/>`;
  s += `<path d="M${f(x)} ${f(y)}H${f(x + R + 3)}" stroke="${C.ink}" stroke-width="2"/>`;
  // A badge before the name; the badge and the name are centred together.
  const big = 11;
  const small = 8;
  const gap = 2;
  const badge = option === "A" ? big : big + 1 + small;
  const total = badge + gap + nameWidth(name);
  const left = x - total / 2;
  s += place(primary, left, nameMid - big / 2, big, C.ink);
  if (option === "B")
    s += place(secondary, left + big + 1, nameMid - small / 2 + 1.5, small, C.inkDim);
  s += text(left + badge + gap, baseline, name, { size: 11, colour: C.ink, mono: true });
  return s;
}

const LEFT = 190;
const COL = 82;
const W = LEFT + COL * PROFESSIONS.length + 10;
const ZOOM_TOP = 30;
const ZOOM_H = 250;
const ROWS_TOP = ZOOM_TOP + ZOOM_H + 20;
const ROW = 100;
const H = ROWS_TOP + ROW * 3 + 10;

const OPTIONS = /** @type {const} */ ([
  ["A", "A: primary, before the name", "One glyph, 11 px, ink."],
  ["B", "B: primary + secondary", "Secondary 8 px, dim ink."],
  ["C", "C: primary on the body", "12 px, dark, under the line."],
]);

/** @type {string[]} */
const parts = [];
parts.push(`<rect width="${f(W)}" height="${f(H)}" fill="${C.bg}"/>`);
for (let gx = 0; gx < W; gx += 32)
  parts.push(`<line x1="${f(gx)}" y1="0" x2="${f(gx)}" y2="${f(H)}" stroke="${C.grid}"/>`);
for (let gy = 0; gy < H; gy += 32)
  parts.push(`<line x1="0" y1="${f(gy)}" x2="${f(W)}" y2="${f(gy)}" stroke="${C.grid}"/>`);

parts.push(
  text(
    10,
    18,
    "Profession in the arena (#166, Q25): three placements. Ink only: in the arena, colour means team.",
    {
      size: 11,
      colour: C.ink,
    },
  ),
);

// The 3x band: a monk/ritualist in each placement.
OPTIONS.forEach(([option, title], i) => {
  const cx = LEFT + 130 + i * 270;
  const cy = ZOOM_TOP + 175;
  parts.push(text(cx, cy + 3 * R + 22, `${title}, 3×`, { anchor: "middle" }));
  parts.push(
    `<g transform="translate(${f(cx)},${f(cy)}) scale(3) translate(${f(-cx)},${f(-cy)})">${actor(cx, cy, option, "monk", "ritualist", C.friend, "Kai")}</g>`,
  );
});

// The 1x rows: every profession, a friend or a foe, each placement.
OPTIONS.forEach(([option, title, note], row) => {
  const y = ROWS_TOP + row * ROW + 62;
  parts.push(text(10, y - 30, title, { colour: C.ink }), text(10, y - 16, note));
  PROFESSIONS.forEach(([name], i) => {
    const second = PROFESSIONS[(i + 3) % PROFESSIONS.length]?.[0] ?? "monk";
    const x = LEFT + COL * i + COL / 2;
    parts.push(
      actor(
        x,
        y,
        option,
        name,
        second,
        i % 2 === 0 ? C.friend : C.foe,
        ["Kai", "Ash", "Moe"][i % 3] ?? "Kai",
      ),
    );
  });
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}">${parts.join("")}</svg>\n`;
writeFileSync(outFile, svg);
console.log(`wrote ${outFile} (${String(svg.length)} bytes)`);
