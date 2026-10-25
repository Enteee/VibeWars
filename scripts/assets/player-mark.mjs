// Draws the reference sheet for the arena player mark (#166): body, dark edge
// (#186), self rim, target ring and the weapon line with its family tip
// (#188), at true size and enlarged.
//
//   node scripts/assets/player-mark.mjs
//
// Writes docs/art/player-mark.svg. It is a design reference, not a game
// asset: the scene draws all of this in code with Phaser Graphics. The
// geometry here mirrors docs/art/art-direction.md ("Player mark"); change it
// there first, then here, then in the renderer.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "player-mark.svg");

/** The palette. Mirrors docs/art/art-direction.md. */
const C = {
  bg: "#0e1116",
  grid: "#1a212c",
  wallFill: "#202836",
  wallStroke: "#3b4759",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  target: "#ffd866",
  friend: "#59c2ff",
  foe: "#ff7b72",
  dead: "#4a5464",
  edge: "#0b0f14",
};

/** Body radius in world units; also the collision radius. */
const R = 14;

/**
 * @typedef {"blade" | "axe" | "hammer" | "daggers" | "bow" | "caster" | "unarmed"} Family
 */

/** @type {readonly { family: Family, label: string }[]} */
const FAMILIES = [
  { family: "blade", label: "sword, spear" },
  { family: "axe", label: "axe, scythe" },
  { family: "hammer", label: "hammer" },
  { family: "daggers", label: "daggers" },
  { family: "bow", label: "bows" },
  { family: "caster", label: "wand, staff" },
  { family: "unarmed", label: "unarmed" },
];

/** @param {number} n */
const f = (n) => String(Math.round(n * 100) / 100);

/**
 * @param {number} x
 * @param {number} y
 * @param {number} a
 * @param {number} d
 * @returns {[number, number]}
 */
const polar = (x, y, a, d) => [x + Math.cos(a) * d, y + Math.sin(a) * d];

/** How far past the body edge the weapon mark's centrelines reach. */
const REACH = 3;

/**
 * The weapon mark for a body at (x, y) facing `a`: open strokes and filled
 * shapes, as point lists. The centrelines end within R + REACH of the centre;
 * the 4 px casing paints 2 units further, to R + 5, under the target ring,
 * which is drawn after it.
 * @param {number} x
 * @param {number} y
 * @param {number} a
 * @param {Family} family
 * @returns {{ strokes: [number, number][][], fills: [number, number][][] }}
 */
function weaponMark(x, y, a, family) {
  if (family === "unarmed") return { strokes: [], fills: [] };
  const tip = polar(x, y, a, R + REACH);
  const [tx, ty] = tip;
  if (family === "axe") {
    // A one-sided head: a triangle hanging off the left of the shaft's end.
    const back = polar(tx, ty, a, -6);
    const out = polar(...polar(tx, ty, a, -2), a - Math.PI / 2, 5);
    return { strokes: [[[x, y], tip]], fills: [[tip, out, back]] };
  }
  if (family === "hammer") {
    return {
      strokes: [
        [[x, y], tip],
        [polar(tx, ty, a - Math.PI / 2, 4), polar(tx, ty, a + Math.PI / 2, 4)],
      ],
      fills: [],
    };
  }
  if (family === "daggers") {
    // The shaft forks 6 units before the tip into two prongs, 30° apart.
    const fork = polar(x, y, a, R + REACH - 5);
    const [fx, fy] = fork;
    return {
      strokes: [
        [[x, y], fork],
        [fork, polar(fx, fy, a - Math.PI / 6, 6)],
        [fork, polar(fx, fy, a + Math.PI / 6, 6)],
      ],
      fills: [],
    };
  }
  if (family === "bow") {
    // An arc of radius 5 over 140°, bulging outward, its apex at the tip.
    const [cx, cy] = polar(tx, ty, a, -5);
    /** @type {[number, number][]} */
    const arc = [];
    for (let k = 0; k <= 8; k++) arc.push(polar(cx, cy, a - 1.22 + (k * 2.44) / 8, 5));
    return { strokes: [[[x, y], tip], arc], fills: [] };
  }
  if (family === "caster") {
    // A filled orb of radius 3 whose outer edge is the tip.
    const [ox, oy] = polar(tx, ty, a, -3);
    /** @type {[number, number][]} */
    const orb = [];
    for (let k = 0; k < 12; k++) orb.push(polar(ox, oy, (k * Math.PI) / 6, 3));
    return {
      strokes: [
        [
          [x, y],
          [ox, oy],
        ],
      ],
      fills: [orb],
    };
  }
  return { strokes: [[[x, y], tip]], fills: [] };
}

/** @param {[number, number][]} pts */
const pts = (pts) => pts.map(([px, py]) => `${f(px)},${f(py)}`).join(" ");

/**
 * The weapon mark as SVG: a 4 px `edge` casing under a 2 px `ink` core, so it
 * reads over the bright body and over the dark floor alike.
 * @param {number} x
 * @param {number} y
 * @param {number} a
 * @param {Family} family
 */
function weaponLine(x, y, a, family) {
  const m = weaponMark(x, y, a, family);
  let out = "";
  for (const [colour, w] of /** @type {const} */ ([
    [C.edge, 4],
    [C.ink, 2],
  ])) {
    const s = `stroke="${colour}" stroke-width="${String(w)}" stroke-linecap="round" stroke-linejoin="round"`;
    for (const p of m.strokes) out += `<polyline points="${pts(p)}" fill="none" ${s}/>`;
    for (const p of m.fills)
      out += `<polygon points="${pts(p)}" fill="${colour}" ${s.replace(String(w), String(w - 2))}/>`;
  }
  return out;
}
/**
 * One living player mark.
 * @param {number} x
 * @param {number} y
 * @param {{ team: string, self?: boolean, target?: boolean, facing: number, family: Family }} p
 */
function actor(x, y, p) {
  let out = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}" fill="${p.team}"/>`;
  out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R - 0.75)}" fill="none" stroke="${C.edge}" stroke-width="1.5"/>`;
  if (p.self)
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R - 2)}" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
  out += weaponLine(x, y, p.facing, p.family);
  if (p.target)
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R + 5)}" fill="none" stroke="${C.target}" stroke-width="2"/>`;
  return out;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {string} s
 * @param {string} [anchor]
 */
const text = (x, y, s, anchor = "middle") =>
  `<text x="${f(x)}" y="${f(y)}" fill="${C.inkDim}" font-family="sans-serif" font-size="10" text-anchor="${anchor}">${s}</text>`;

const COL = 92;
const LEFT = 120;
const W = LEFT + COL * FAMILIES.length + 20;
const H = 560;
const diag = -Math.PI / 6;

/** @type {string[]} */
const parts = [];
parts.push(`<rect width="${f(W)}" height="${f(H)}" fill="${C.bg}"/>`);
for (let gx = 0; gx < W; gx += 32)
  parts.push(`<line x1="${f(gx)}" y1="0" x2="${f(gx)}" y2="${f(H)}" stroke="${C.grid}"/>`);
for (let gy = 0; gy < H; gy += 32)
  parts.push(`<line x1="0" y1="${f(gy)}" x2="${f(W)}" y2="${f(gy)}" stroke="${C.grid}"/>`);

FAMILIES.forEach(({ family, label }, i) => {
  const cx = LEFT + COL * i + COL / 2;
  parts.push(text(cx, 18, family), text(cx, 30, label));
  // Row 1: 4x, foe, facing right.
  parts.push(
    `<g transform="translate(${f(cx)},90) scale(4) translate(${f(-cx)},-90)">${actor(cx, 90, { team: C.foe, facing: 0, family })}</g>`,
  );
  // Rows 2-5: true size.
  parts.push(actor(cx, 190, { team: C.foe, facing: 0, family }));
  parts.push(actor(cx, 240, { team: C.friend, facing: diag, family }));
  parts.push(actor(cx, 290, { team: C.friend, self: true, facing: Math.PI / 2, family }));
  parts.push(actor(cx, 340, { team: C.foe, target: true, facing: Math.PI * 0.8, family }));
  // Row 6: against a wall, the reason for the dark edge.
  parts.push(
    `<rect x="${f(cx - 40)}" y="370" width="80" height="18" fill="${C.wallFill}" stroke="${C.wallStroke}"/>`,
  );
  parts.push(actor(cx, 400, { team: C.friend, facing: -Math.PI / 2, family }));
});

parts.push(
  text(10, 94, "4×, foe", "start"),
  text(10, 194, "1×, foe →", "start"),
  text(10, 244, "1×, friend ↗", "start"),
  text(10, 294, "1×, you ↓", "start"),
  text(10, 344, "1×, target ↖", "start"),
  text(10, 404, "1×, at a wall ↑", "start"),
);

// Row 7: a crowded clump at true size, mixed families and facings.
parts.push(text(10, 484, "1×, 8v8 clump", "start"));
for (let k = 0; k < 16; k++) {
  const fam = FAMILIES[k % FAMILIES.length]?.family ?? "blade";
  const x = LEFT + 30 + (k % 8) * 34 + (k >= 8 ? 17 : 0);
  const y = 465 + Math.floor(k / 8) * 34;
  parts.push(
    actor(x, y, {
      team: k >= 8 ? C.foe : C.friend,
      self: k === 3,
      target: k === 12,
      facing: k >= 8 ? -Math.PI / 2 + k * 0.4 : Math.PI / 2 - k * 0.5,
      family: fam,
    }),
  );
}
// Two corpses in the clump: no line, hollow.
for (const [x, y] of [
  [LEFT + 330, 470],
  [LEFT + 364, 500],
]) {
  parts.push(
    `<circle cx="${f(x ?? 0)}" cy="${f(y ?? 0)}" r="${f(R)}" fill="none" stroke="${C.dead}" stroke-width="2"/>`,
  );
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}">${parts.join("")}</svg>\n`;
writeFileSync(outFile, svg);
console.log(`wrote ${outFile} (${String(svg.length)} bytes)`);
