// Draws the reference sheet for the arena player mark (#166): body, dark edge
// (#186), self rim, enchantment and hex rings (#1117), target ring, the 14
// weapon marks (#188, #418) and the off-hand mark (#275), at true size and
// enlarged.
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

import { WEAPON_MARK_GEOMETRY } from "../../apps/web/src/render/weapon-mark-geometry.ts";

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
  barFill: "#7ee787",
  barBg: "#11161d",
  condition: "#ffa657",
  hex: "#d2a8ff",
  enchantment: "#56d4dd",
};

/** Body radius in world units; also the collision radius. */
const R = 14;

/** @typedef {keyof typeof WEAPON_MARK_GEOMETRY} Family */

/** @type {readonly { family: Family, label: string }[]} */
const FAMILIES = /** @type {Family[]} */ (Object.keys(WEAPON_MARK_GEOMETRY)).map((family) => ({
  family,
  label: family,
}));

/** Only one-handed weapons leave the left hand free for a shield or a focus. */
const ONE_HANDED = new Set(["sword", "axe", "spear", "wand"]);

/**
 * @typedef {"shield" | "focus" | "none"} Offhand
 */

/** Where the target ring's 2 px stroke is centred: r + 8 … r + 10 (Q26). */
const TARGET_AT = 9;
/** Where the enchantment ring's 1.5 px stroke is centred: r + 1.75 … r + 3.25 (#1117). */
const ENCHANT_AT = 2.5;
/** Where the hex ring's is: r + 4.25 … r + 5.75, in 8 dashes at 50% duty, one centred on 12 o'clock. */
const HEX_AT = 5;
const HEX_DASHES = 8;

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

/**
 * The off-hand side is the left of the facing (y points down, so a - 90°),
 * the side the axe head already hangs on. Every weapon tip, casing included,
 * stays within 25° of the facing; the swing flash spans ±45°.
 */
const OFF_SIDE = -Math.PI / 2;
/** The shield: an arc on the body's centre from 45° to 105° off the facing. */
const SHIELD_FROM = (45 * Math.PI) / 180;
const SHIELD_TO = (105 * Math.PI) / 180;
const SHIELD_AT = R + 3.5;
/** The focus: a ring of radius 1.75 centred 75° off the facing, at r + 3.5. */
const FOCUS_ANGLE = (75 * Math.PI) / 180;
const FOCUS_AT = R + 3.5;
const FOCUS_R = 1.75;

/**
 * The off-hand mark, cased like the weapon mark: `edge` under `ink`.
 * Shield: 5 px casing (r + 1 … r + 6) under a 3 px core. Focus: 3 px
 * casing under a 1.5 px core, r + 0.25 … r + 6.75. Both inside r + 7.
 * @param {number} x
 * @param {number} y
 * @param {number} a
 * @param {Offhand} offhand
 */
function offhandMark(x, y, a, offhand) {
  if (offhand === "none") return "";
  const side = OFF_SIDE > 0 ? 1 : -1;
  let out = "";
  if (offhand === "shield") {
    const [x1, y1] = polar(x, y, a + side * SHIELD_FROM, SHIELD_AT);
    const [x2, y2] = polar(x, y, a + side * SHIELD_TO, SHIELD_AT);
    const d = `M${f(x1)} ${f(y1)}A${f(SHIELD_AT)} ${f(SHIELD_AT)} 0 0 ${side > 0 ? "1" : "0"} ${f(x2)} ${f(y2)}`;
    for (const [colour, w] of /** @type {const} */ ([
      [C.edge, 5],
      [C.ink, 3],
    ]))
      out += `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${String(w)}" stroke-linecap="butt"/>`;
    return out;
  }
  const [fx, fy] = polar(x, y, a + side * FOCUS_ANGLE, FOCUS_AT);
  for (const [colour, w] of /** @type {const} */ ([
    [C.edge, 3],
    [C.ink, 1.5],
  ]))
    out += `<circle cx="${f(fx)}" cy="${f(fy)}" r="${f(FOCUS_R)}" fill="none" stroke="${colour}" stroke-width="${String(w)}"/>`;
  return out;
}

/**
 * The weapon mark for a body at (x, y) facing `a`: the local-frame geometry
 * (+x facing, +y right hand) rotated and translated, as point lists.
 * @param {number} x
 * @param {number} y
 * @param {number} a
 * @param {Family} family
 * @returns {{ strokes: [number, number][][], fills: [number, number][][], strings: [number, number][][] }}
 */
function weaponMark(x, y, a, family) {
  const g = WEAPON_MARK_GEOMETRY[family];
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  /** @param {readonly { x: number, y: number }[]} line @returns {[number, number][]} */
  const place = (line) => line.map((q) => [x + q.x * cos - q.y * sin, y + q.x * sin + q.y * cos]);
  return {
    strokes: g.strokes.map(place),
    fills: g.fills.map(place),
    strings: g.strings.map(place),
  };
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
    const s = `stroke="${colour}" stroke-width="${String(w)}" stroke-linecap="butt" stroke-linejoin="miter"`;
    for (const p of m.strokes) out += `<polyline points="${pts(p)}" fill="none" ${s}/>`;
    for (const p of m.fills)
      out += `<polygon points="${pts(p)}" fill="${colour}" ${s.replace(String(w), String(w - 2))}/>`;
  }
  for (const [colour, w] of /** @type {const} */ ([
    [C.edge, 3],
    [C.ink, 1],
  ]))
    for (const p of m.strings)
      out += `<polyline points="${pts(p)}" fill="none" stroke="${colour}" stroke-width="${String(w)}" stroke-linecap="butt" stroke-linejoin="miter"/>`;
  return out;
}
/**
 * One living player mark.
 * @param {number} x
 * @param {number} y
 * @param {{ team: string, self?: boolean, enchanted?: boolean, hexed?: boolean, target?: boolean, facing: number, family: Family, offhand?: Offhand, hud?: boolean }} p
 */
function actor(x, y, p) {
  const offhand = ONE_HANDED.has(p.family) ? (p.offhand ?? "none") : "none";
  let out = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}" fill="${p.team}"/>`;
  out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R - 0.75)}" fill="none" stroke="${C.edge}" stroke-width="1.5"/>`;
  if (p.self)
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R - 2)}" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
  if (p.enchanted)
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R + ENCHANT_AT)}" fill="none" stroke="${C.enchantment}" stroke-width="1.5"/>`;
  if (p.hexed) {
    // SVG strokes a circle from 3 o'clock, where a dash is centred too, as on every eighth.
    const dash = (2 * Math.PI * (R + HEX_AT)) / (2 * HEX_DASHES);
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R + HEX_AT)}" fill="none" stroke="${C.hex}" stroke-width="1.5" stroke-dasharray="${f(dash)} ${f(dash)}" stroke-dashoffset="${f(dash / 2)}"/>`;
  }
  out += offhandMark(x, y, p.facing, offhand);
  out += weaponLine(x, y, p.facing, p.family);
  if (p.target)
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R + TARGET_AT)}" fill="none" stroke="${C.target}" stroke-width="2"/>`;
  if (p.hud === true) {
    // The health bar and one status plate, drawn over the ring as in the arena.
    out += `<rect x="${f(x - 17)}" y="${f(y - R - 12)}" width="34" height="4" fill="${C.barBg}"/>`;
    out += `<rect x="${f(x - 17)}" y="${f(y - R - 12)}" width="24" height="4" fill="${C.barFill}"/>`;
    out += `<circle cx="${f(x)}" cy="${f(y + R + 14)}" r="7" fill="${C.condition}" stroke="${C.edge}" stroke-width="1"/>`;
  }
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
/**
 * The 4x band has its own pitch: a 4x mark paints out to 4 * (R + 7) = 84 px
 * from its centre (4 * (R + 10) with the target ring), so at the true-size
 * column pitch the marks would hide under their neighbours' bodies.
 */
const BIG = 4;
const BIG_COL = 180;
const BIG_PER_ROW = 7;
const BIG_ROW = 200;
const W = Math.max(LEFT + COL * FAMILIES.length, LEFT + BIG_COL * BIG_PER_ROW) + 20;

/**
 * The off-hand and ring row of the 4x band. The target examples carry the
 * health bar and a status plate, drawn over the rings as the arena draws them.
 * @type {readonly { label: string, family: Family, offhand: Offhand, target?: boolean, enchanted?: boolean, hexed?: boolean }[]}
 */
const OFFHANDS = [
  { label: "sword + shield", family: "sword", offhand: "shield" },
  { label: "axe + shield", family: "axe", offhand: "shield" },
  { label: "wand + focus", family: "wand", offhand: "focus" },
  { label: "target, r + 9", family: "sword", offhand: "shield", target: true },
  { label: "enchanted, r + 2.5", family: "wand", offhand: "focus", enchanted: true },
  { label: "hexed, r + 5", family: "sword", offhand: "shield", hexed: true },
  {
    label: "both, target",
    family: "staff",
    offhand: "none",
    target: true,
    enchanted: true,
    hexed: true,
  },
];
const BIG_ROWS = Math.ceil(FAMILIES.length / BIG_PER_ROW) + 1;
/** Where the true-size grid starts, below the 4x band. */
const DY = 70 + BIG_ROW * BIG_ROWS;
const H = 680 + DY - 60;
const diag = -Math.PI / 6;

/** @type {string[]} */
const parts = [];
parts.push(`<rect width="${f(W)}" height="${f(H)}" fill="${C.bg}"/>`);
for (let gx = 0; gx < W; gx += 32)
  parts.push(`<line x1="${f(gx)}" y1="0" x2="${f(gx)}" y2="${f(H)}" stroke="${C.grid}"/>`);
for (let gy = 0; gy < H; gy += 32)
  parts.push(`<line x1="0" y1="${f(gy)}" x2="${f(W)}" y2="${f(gy)}" stroke="${C.grid}"/>`);

FAMILIES.forEach(({ family, label }, i) => {
  // The 4x band: foe, facing right, labelled above.
  const bx = LEFT + BIG_COL * (i % BIG_PER_ROW) + BIG_COL / 2;
  const by = 110 + BIG_ROW * Math.floor(i / BIG_PER_ROW);
  parts.push(
    text(bx, by - 90, family),
    `<g transform="translate(${f(bx)},${f(by)}) scale(${f(BIG)}) translate(${f(-bx)},${f(-by)})">${actor(bx, by, { team: C.foe, facing: 0, family })}</g>`,
  );

  const cx = LEFT + COL * i + COL / 2;
  parts.push(text(cx, DY + 18, family));
  if (label !== family) parts.push(text(cx, DY + 30, label));
  // Rows 1-4: true size.
  parts.push(actor(cx, DY + 90, { team: C.foe, facing: 0, family }));
  parts.push(actor(cx, DY + 140, { team: C.friend, facing: diag, family }));
  parts.push(actor(cx, DY + 190, { team: C.friend, self: true, facing: Math.PI / 2, family }));
  parts.push(
    actor(cx, DY + 240, {
      team: C.foe,
      target: true,
      hud: true,
      facing: Math.PI * 0.8,
      family,
    }),
  );
  // Row 5: against a wall, the reason for the dark edge.
  parts.push(
    `<rect x="${f(cx - 40)}" y="${f(DY + 290)}" width="80" height="18" fill="${C.wallFill}" stroke="${C.wallStroke}"/>`,
  );
  parts.push(actor(cx, DY + 320, { team: C.friend, facing: -Math.PI / 2, family }));
  // Rows 6-7: every tip beside a shield and a focus, to show they never touch.
  parts.push(actor(cx, DY + 370, { team: C.foe, facing: diag, family, offhand: "shield" }));
  parts.push(actor(cx, DY + 420, { team: C.friend, facing: 0, family, offhand: "focus" }));
});

OFFHANDS.forEach(({ label, family, offhand, target, enchanted, hexed }, i) => {
  const bx = LEFT + BIG_COL * i + BIG_COL / 2;
  const by = 110 + BIG_ROW * (BIG_ROWS - 1);
  parts.push(
    text(bx, by - 90, label),
    `<g transform="translate(${f(bx)},${f(by)}) scale(${f(BIG)}) translate(${f(-bx)},${f(-by)})">${actor(bx, by, { team: C.foe, facing: 0, family, offhand, target: target === true, enchanted, hexed, hud: target === true })}</g>`,
  );
});

parts.push(
  text(10, 94, "4×, foe →", "start"),
  text(10, DY + 94, "1×, foe →", "start"),
  text(10, DY + 144, "1×, friend ↗", "start"),
  text(10, DY + 194, "1×, you ↓", "start"),
  text(10, DY + 244, "1×, target ↖", "start"),
  text(10, DY + 324, "1×, at a wall ↑", "start"),
  text(10, DY + 374, "1×, + shield ↗", "start"),
  text(10, DY + 424, "1×, + focus →", "start"),
  text(10, 114 + BIG_ROW * (BIG_ROWS - 1), "4×, off-hand, rings", "start"),
);

// Row 6: a crowded clump at true size, mixed families and facings.
parts.push(text(10, DY + 504, "1×, 8v8 clump", "start"));
for (let k = 0; k < 16; k++) {
  const fam = FAMILIES[k % FAMILIES.length]?.family ?? "sword";
  const x = LEFT + 30 + (k % 8) * 34 + (k >= 8 ? 17 : 0);
  const y = DY + 485 + Math.floor(k / 8) * 34;
  parts.push(
    actor(x, y, {
      team: k >= 8 ? C.foe : C.friend,
      self: k === 3,
      enchanted: k === 3 || k === 5 || k === 13,
      hexed: k === 10 || k === 13,
      target: k === 12,
      facing: k >= 8 ? -Math.PI / 2 + k * 0.4 : Math.PI / 2 - k * 0.5,
      family: fam,
      offhand: k % 3 === 0 ? "shield" : k % 3 === 1 ? "focus" : "none",
    }),
  );
}
// Two corpses in the clump: no line, hollow.
for (const [x, y] of [
  [LEFT + 330, DY + 490],
  [LEFT + 364, DY + 520],
]) {
  parts.push(
    `<circle cx="${f(x ?? 0)}" cy="${f(y ?? 0)}" r="${f(R)}" fill="none" stroke="${C.dead}" stroke-width="2"/>`,
  );
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}">${parts.join("")}</svg>\n`;
writeFileSync(outFile, svg);
console.log(`wrote ${outFile} (${String(svg.length)} bytes)`);
