/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-plus-operands, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions -- reads untyped map.json and writes SVG: numbers go into strings everywhere. */
/**
 * #4004: survey the empty walkable ground of every map.
 *
 * Rasterises each map's ground layer at CELL units: outside the bounds, walls,
 * deep water and pits are blocked. A walkable cell is "empty" when it is at
 * least CLEAR units from anything blocked (a disc of 2*CLEAR = 200 u fits: ~6 bodies across, the card's "≥ ~4" with room for a prop),
 * so a prop of up to ~160 u fits there with a body's width to spare.
 * Writes docs/art/populate/<map>.svg (overview, empty ground shaded and
 * outlined) and docs/art/populate/survey.json (numbers for the table), then
 * converts the SVGs to 800 px PNGs with ImageMagick when asked (--png).
 *
 * Run: company heavy node scripts/assets/populate-survey.mjs --png
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MAPS = path.join(ROOT, "packages/game-maps/maps");
const OUT = path.join(ROOT, "docs/art/populate");
const CELL = 20;
const CLEAR = 100;
const png = process.argv.includes("--png");
const direct = process.argv[1] === import.meta.filename;

/** @param {{x:number,y:number}[]} pts @param {number} x @param {number} y */
function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** @param {any} s */
export function shapePoints(s) {
  if (s.kind === "polygon") return s.points;
  return [
    { x: s.x, y: s.y },
    { x: s.x + s.width, y: s.y },
    { x: s.x + s.width, y: s.y + s.height },
    { x: s.x, y: s.y + s.height },
  ];
}

/** @param {any} m */
export function survey(m) {
  const w = Math.ceil(m.width / CELL);
  const h = Math.ceil(m.height / CELL);
  const ground = m.groundLayer ?? 0;
  const blocked = new Uint8Array(w * h);
  const walkable = new Uint8Array(w * h);
  /** @type {{x:number,y:number}[][]} */
  const solids = [];
  for (const wall of m.walls) if ((wall.layer ?? 0) === ground) solids.push(shapePoints(wall));
  for (const water of m.water ?? []) {
    if (water.depth === "deep" && (water.layer ?? 0) === ground)
      solids.push(shapePoints(water.area));
  }
  for (const pit of m.pits ?? []) solids.push(shapePoints(pit.footprint));
  const outline = m.bounds.kind === "outline" ? m.bounds.outline : undefined;
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const x = (cx + 0.5) * CELL;
      const y = (cy + 0.5) * CELL;
      const i = cy * w + cx;
      const inside = outline === undefined ? x < m.width && y < m.height : inPoly(outline, x, y);
      if (!inside || solids.some((p) => inPoly(p, x, y))) blocked[i] = 1;
      else walkable[i] = 1;
    }
  }
  // Chamfer distance (in cells) from the nearest blocked cell.
  const INF = 1e9;
  const d = new Float32Array(w * h).map((_, i) => (blocked[i] ? 0 : INF));
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      d[i] = Math.min(
        d[i],
        at(x - 1, y) + 1,
        at(x, y - 1) + 1,
        at(x - 1, y - 1) + 1.414,
        at(x + 1, y - 1) + 1.414,
      );
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      d[i] = Math.min(
        d[i],
        at(x + 1, y) + 1,
        at(x, y + 1) + 1,
        at(x + 1, y + 1) + 1.414,
        at(x - 1, y + 1) + 1.414,
      );
    }
  const need = CLEAR / CELL;
  const empty = new Uint8Array(w * h);
  // Empty ground is where a disc of radius CLEAR fits: the cells at least CLEAR from anything blocked.
  let walk = 0;
  for (let i = 0; i < w * h; i++) walk += walkable[i];
  for (let i = 0; i < w * h; i++) if (walkable[i] && d[i] >= need) empty[i] = 1;
  let emptyCells = 0;
  for (let i = 0; i < w * h; i++) emptyCells += empty[i];
  // Largest empty disc: the biggest clearance.
  let maxClear = 0;
  for (let i = 0; i < w * h; i++) if (d[i] < INF) maxClear = Math.max(maxClear, d[i]);
  return {
    w,
    h,
    walkable,
    empty,
    solids,
    outline,
    walkCells: walk,
    emptyCells,
    maxClear: maxClear * CELL,
  };
}

/** @param {any} m @param {ReturnType<typeof survey>} s */
function svg(m, s) {
  const pts = (/** @type {{x:number,y:number}[]} */ p) => p.map((q) => `${q.x},${q.y}`).join(" ");
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.width} ${m.height}" width="800" height="${Math.round((800 * m.height) / m.width)}">`,
  ];
  out.push(`<rect width="${m.width}" height="${m.height}" fill="#1b1f24"/>`);
  const ground = s.outline
    ? `<polygon points="${pts(s.outline)}" fill="#4a5a44"/>`
    : `<rect width="${m.width}" height="${m.height}" fill="#4a5a44"/>`;
  out.push(ground);
  for (const p of s.solids)
    out.push(`<polygon points="${pts(p)}" fill="#20252b" stroke="#0c0e10" stroke-width="6"/>`);
  // Empty ground: one rect per horizontal run, shaded and outlined as a group.
  const runs = [];
  for (let y = 0; y < s.h; y++) {
    let x = 0;
    while (x < s.w) {
      if (!s.empty[y * s.w + x]) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < s.w && s.empty[y * s.w + x]) x++;
      runs.push(`M${x0 * CELL} ${y * CELL}h${(x - x0) * CELL}v${CELL}h${-(x - x0) * CELL}z`);
    }
  }
  out.push(
    `<path d="${runs.join("")}" fill="#ff3b30" fill-opacity="0.38" stroke="#ff3b30" stroke-width="3" stroke-opacity="0.9"/>`,
  );
  for (const sp of m.spawnPoints ?? [])
    out.push(`<circle cx="${sp.x}" cy="${sp.y}" r="25" fill="#ffd60a"/>`);
  out.push("</svg>");
  return out.join("\n");
}

if (direct) {
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  for (const id of fs.readdirSync(MAPS).sort()) {
    const m = JSON.parse(fs.readFileSync(path.join(MAPS, id, "map.json"), "utf8"));
    const s = survey(m);
    fs.writeFileSync(path.join(OUT, `${id}.svg`), svg(m, s));
    const cellArea = CELL * CELL;
    const row = {
      id,
      biome: m.biome,
      mode: m.mode,
      size: `${m.width}x${m.height}`,
      walkableArea: s.walkCells * cellArea,
      emptyArea: s.emptyCells * cellArea,
      emptyPct: Math.round((100 * s.emptyCells) / Math.max(1, s.walkCells)),
      emptyBodies: Math.round((s.emptyCells * cellArea) / (Math.PI * 30 * 30 * 4)),
      widestGap: Math.round(s.maxClear * 2),
    };
    rows.push(row);
    console.log(JSON.stringify(row));
    if (png) {
      execFileSync("magick", [
        "-background",
        "none",
        path.join(OUT, `${id}.svg`),
        "-resize",
        "800x",
        "-strip",
        "-colors",
        "48",
        path.join(OUT, `${id}.png`),
      ]);
      fs.rmSync(path.join(OUT, `${id}.svg`));
    }
  }
  rows.sort((a, b) => b.emptyPct - a.emptyPct);
  fs.writeFileSync(path.join(OUT, "survey.json"), JSON.stringify(rows, null, 1) + "\n");
}
