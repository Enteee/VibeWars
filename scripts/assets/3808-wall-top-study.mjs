/* eslint-disable @typescript-eslint/restrict-template-expressions, @typescript-eslint/restrict-plus-operands, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- an SVG generator over a bundle imported at run time (untyped): numbers go into strings everywhere. */
// The #3808 study: a wall top that carries the outside land's own texture, on rock and on basalt,
// beside the outside land, at four lift amounts. The tile is the game's own painter
// (apps/web/src/render/outside-land.ts) run into SVG, so the study cannot drift from it.
// Usage: node scripts/assets/3808-wall-top-study.mjs <outdir>   (needs inkscape and esbuild;
// ESBUILD=<path> overrides `pnpm exec esbuild`)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = process.argv[2] ?? "docs/art";
const tmp = join(out, ".3808-tmp");
mkdirSync(tmp, { recursive: true });
const esbuild = process.env.ESBUILD ?? "pnpm";
const args = process.env.ESBUILD ? [] : ["exec", "esbuild"];
execFileSync(
  esbuild,
  [
    ...args,
    "apps/web/src/render/outside-land.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    `--outfile=${join(tmp, "ol.mjs")}`,
    "--log-level=error",
  ],
  { stdio: "inherit" },
);
const { paintOutsideTile, OUTSIDE_TILE, OUTSIDE_LOOK } = await import(
  pathToFileURL(join(tmp, "ol.mjs")).href
);

const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
/** The game's painter, as SVG. */
function tileSvg(kind) {
  let fill = ["#000", 1];
  let line = [1, "#000", 1];
  const o = [];
  const f = () => `fill="${fill[0]}" fill-opacity="${fill[1]}"`;
  const painter = {
    fillStyle: (c, a) => {
      fill = [hex(c), a];
    },
    lineStyle: (w, c, a) => {
      line = [w, hex(c), a];
    },
    fillRect: (x, y, w, h) => o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${f()}/>`),
    fillCircle: (x, y, r) => o.push(`<circle cx="${x}" cy="${y}" r="${r}" ${f()}/>`),
    fillEllipse: (x, y, w, h) =>
      o.push(`<ellipse cx="${x}" cy="${y}" rx="${w / 2}" ry="${h / 2}" ${f()}/>`),
    strokeEllipse: (x, y, w, h) =>
      o.push(
        `<ellipse cx="${x}" cy="${y}" rx="${w / 2}" ry="${h / 2}" fill="none" stroke="${line[1]}" stroke-width="${line[0]}" stroke-opacity="${line[2]}"/>`,
      ),
    fillTriangle: (a, b, c, d, e, g) =>
      o.push(`<polygon points="${a},${b} ${c},${d} ${e},${g}" ${f()}/>`),
    lineBetween: (a, b, c, d) =>
      o.push(
        `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${line[1]}" stroke-width="${line[0]}" stroke-opacity="${line[2]}"/>`,
      ),
  };
  paintOutsideTile(painter, kind);
  return `<pattern id="t-${kind}" width="${OUTSIDE_TILE}" height="${OUTSIDE_TILE}" patternUnits="userSpaceOnUse">${o.join("")}</pattern>`;
}

// The lift: a light wash of the kind's own pale tone over the tile, so the top is the lightest plane.
const LIFT = { rock: OUTSIDE_LOOK.rock.rim, basalt: OUTSIDE_LOOK.basalt.ash };
const AMOUNTS = [0, 0.12, 0.22, 0.32];
const FACE = 0.55; // black over the tile: the face is darker than the land
const H = 56; // one wall layer, ELEVATION_STEP

const W = 330;
const PH = 330;
function panel(kind, amount, x0) {
  // land everywhere; a wall slab (top at y 70..190, x 60..270) lifted by H, its face below.
  const top = [
    [60, 60],
    [270, 50],
    [284, 150],
    [250, 196],
    [74, 190],
  ];
  const lifted = top.map(([x, y]) => [x + x0, y]);
  const base = top.map(([x, y]) => [x + x0, y + H]);
  const p = (a) => a.map(([x, y]) => `${x},${y}`).join(" ");
  const shadow = base.map(([x, y]) => [x + 40, y + 30]);
  return `
  <svg x="${x0}" y="0" width="${W}" height="${PH}" viewBox="${x0} 0 ${W} ${PH}">
  <rect x="${x0}" y="0" width="${W}" height="${PH}" fill="url(#t-${kind})"/>
  <polygon points="${p(shadow)}" fill="#080b10" fill-opacity="0.55"/>
  <polygon points="${p(base)}" fill="url(#t-${kind})"/><polygon points="${p(base)}" fill="#000" fill-opacity="${FACE}"/>
  <polygon points="${p([lifted[3], lifted[4], base[4], base[3]])}" fill="#000" fill-opacity="${FACE}"/>
  <polygon points="${p([lifted[2], lifted[3], base[3], base[2]])}" fill="url(#t-${kind})"/><polygon points="${p([lifted[2], lifted[3], base[3], base[2]])}" fill="#000" fill-opacity="${FACE}"/>
  <polygon points="${p([lifted[4], lifted[0], base[0], base[4]])}" fill="url(#t-${kind})"/><polygon points="${p([lifted[4], lifted[0], base[0], base[4]])}" fill="#000" fill-opacity="${FACE}"/>
  <polygon points="${p(lifted)}" fill="url(#t-${kind})"/>
  <polygon points="${p(lifted)}" fill="${hex(LIFT[kind])}" fill-opacity="${amount}"/>
  <polyline points="${p([lifted[2], lifted[3], lifted[4]])}" fill="none" stroke="#a9bbd0" stroke-width="3" stroke-linejoin="round"/>
  <polygon points="${p(lifted)}" fill="none" stroke="#3b4759" stroke-width="2" stroke-opacity="0.8"/>
  <text x="${x0 + 12}" y="${PH - 12}" font-family="sans-serif" font-size="15" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${kind} · lift ${Math.round(amount * 100)} %</text>
  </svg>`;
}

for (const kind of ["rock", "basalt"]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 4}" height="${PH}"><defs>${tileSvg(kind)}</defs>${AMOUNTS.map((a, i) => panel(kind, a, i * W)).join("")}</svg>`;
  const file = join(tmp, `${kind}.svg`);
  writeFileSync(file, svg);
  execFileSync(
    "inkscape",
    [
      file,
      "--export-type=png",
      `--export-filename=${join(out, `3808-wall-top-${kind}.png`)}`,
      "--export-width",
      String(W * 4),
    ],
    { stdio: "ignore" },
  );
}
