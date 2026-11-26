// Draws the reference sheet for weapon motion (#536, #559): seven key poses
// per weapon at 4x, read from `weaponPose()` itself, so the sheet cannot drift
// from what ships.
//
//   node scripts/assets/weapon-motion.mjs
//
// Writes docs/art/weapon-motion.svg. A design reference, not a game asset.
// The poses and timings live in apps/web/src/render/weapon-pose.ts; change
// them there, then regenerate. The look mirrors docs/art/art-direction.md
// ("Weapon motion", "Player mark").

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// First: lets weapon-pose.ts find the .ts files its ".js" imports mean. A
// static import of it would be linked before the hook is registered.
import "./ts-resolve.mjs";

import { WEAPON_MARK_GEOMETRY } from "../../apps/web/src/render/weapon-mark-geometry.ts";

const { WEAPON_MOTION, weaponPose } =
  /** @type {typeof import("../../apps/web/src/render/weapon-pose.ts")} */ (
    await import("../../apps/web/src/render/weapon-pose.ts")
  );

/** @typedef {import("../../apps/web/src/render/weapon-mark-geometry.ts").WeaponMarkId} WeaponMarkId */

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "weapon-motion.svg");

/** The palette. Mirrors docs/art/art-direction.md. */
const C = {
  bg: "#0e1116",
  grid: "#1a212c",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  target: "#ffd866",
  foe: "#ff7b72",
  edge: "#0b0f14",
};

/** Body radius in world units. */
const R = 14;
/** The target ring's centre, and the furthest a weapon may reach (#536). */
const TARGET_AT = 9;
const LIMIT = 5.5;
const BIG = 4;

/**
 * The seven key poses of #536, in order.
 * @type {readonly { label: string, clip: () => import("../../apps/web/src/render/weapon-pose.ts").AttackClip }[]}
 */
const POSES = [
  { label: "rest", clip: () => ({ phase: "rest" }) },
  { label: "half wind", clip: () => ({ phase: "wind-up", progress: 0.5 }) },
  { label: "full wind", clip: () => ({ phase: "wind-up", progress: 1 }) },
  { label: "half strike", clip: () => ({ phase: "strike", progress: 0.5 }) },
  { label: "hit", clip: () => ({ phase: "hold", progress: 0, sinceHit: 0 }) },
  { label: "early recover", clip: () => ({ phase: "recover", progress: 0.25, sinceHit: 0.1 }) },
  { label: "late recover", clip: () => ({ phase: "recover", progress: 0.75, sinceHit: 0.3 }) },
];

/** @param {number} n */
const f = (n) => String(Math.round(n * 100) / 100);

/** @param {readonly { x: number, y: number }[]} pts */
const pts = (pts) => pts.map((q) => `${f(q.x)},${f(q.y)}`).join(" ");

/**
 * The posed mark as SVG, local frame facing +x: a 4 px `edge` casing under
 * a 2 px `ink` core, like the shipped mark.
 * @param {WeaponMarkId} family
 * @param {import("../../apps/web/src/render/weapon-pose.ts").AttackClip} clip
 */
function mark(family, clip) {
  const m = weaponPose(family, clip, 0);
  let out = "";
  for (const [colour, w] of /** @type {const} */ ([
    [C.edge, 4],
    [C.ink, 2],
  ])) {
    const s = `stroke="${colour}" stroke-width="${String(w)}" stroke-linecap="butt" stroke-linejoin="miter"`;
    for (const p of m.strokes) out += `<polyline points="${pts(p)}" fill="none" ${s}/>`;
    for (const p of m.fills)
      out += `<polygon points="${pts(p)}" fill="${colour}" stroke="${colour}" stroke-width="${String(w - 2)}"/>`;
  }
  for (const [colour, w] of /** @type {const} */ ([
    [C.edge, 3],
    [C.ink, 1],
  ]))
    for (const p of m.strings)
      out += `<polyline points="${pts(p)}" fill="none" stroke="${colour}" stroke-width="${String(w)}"/>`;
  return m.alpha < 1 ? `<g opacity="${f(m.alpha)}">${out}</g>` : out;
}

const FAMILIES = /** @type {WeaponMarkId[]} */ (Object.keys(WEAPON_MARK_GEOMETRY));
const LEFT = 150;
const COL = 215;
const ROW = 215;
const TOP = 40;
const W = LEFT + COL * POSES.length + 10;
const H = TOP + ROW * FAMILIES.length;

/** @type {string[]} */
const parts = [`<rect width="${String(W)}" height="${String(H)}" fill="${C.bg}"/>`];
for (let gx = 0; gx < W; gx += 32)
  parts.push(
    `<line x1="${String(gx)}" y1="0" x2="${String(gx)}" y2="${String(H)}" stroke="${C.grid}"/>`,
  );
for (let gy = 0; gy < H; gy += 32)
  parts.push(
    `<line x1="0" y1="${String(gy)}" x2="${String(W)}" y2="${String(gy)}" stroke="${C.grid}"/>`,
  );

/** @param {number} x @param {number} y @param {string} s @param {string} [anchor] */
const text = (x, y, s, anchor = "middle") =>
  `<text x="${f(x)}" y="${f(y)}" fill="${C.inkDim}" font-family="sans-serif" font-size="12" text-anchor="${anchor}">${s}</text>`;

POSES.forEach((pose, i) => parts.push(text(LEFT + COL * i + COL / 2, 26, pose.label)));

FAMILIES.forEach((family, row) => {
  const cy = TOP + ROW * row + ROW / 2;
  const m = WEAPON_MOTION[family];
  const secs = (/** @type {number} */ n) => f(n);
  parts.push(
    text(10, cy - 4, family, "start"),
    text(
      10,
      cy + 12,
      `${secs(m.windUp)} / ${secs(m.strike)} / ${secs(m.hold)} / ${secs(m.recover)}s`,
      "start",
    ),
  );
  POSES.forEach((pose, col) => {
    const cx = LEFT + COL * col + COL / 2;
    parts.push(
      `<g transform="translate(${f(cx)},${f(cy)}) scale(${String(BIG)})">` +
        `<circle r="${String(R)}" fill="${C.foe}"/>` +
        `<circle r="${f(R - 0.75)}" fill="none" stroke="${C.edge}" stroke-width="1.5"/>` +
        mark(family, pose.clip()) +
        `<circle r="${f(R + LIMIT)}" fill="none" stroke="${C.ink}" stroke-width="0.4" stroke-dasharray="2 2" opacity="0.6"/>` +
        `<circle r="${f(R + TARGET_AT)}" fill="none" stroke="${C.target}" stroke-width="2"/>` +
        `</g>`,
    );
  });
});
parts.push(
  text(
    W - 10,
    H - 6,
    "dashed: r + 5.5 limit · yellow: target ring · timings: wind-up / strike / hold / recover",
    "end",
  ),
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(W)} ${String(H)}" width="${String(W)}" height="${String(H)}">${parts.join("")}</svg>\n`;
writeFileSync(outFile, svg);
console.log(`wrote ${outFile} (${String(svg.length)} bytes)`);
