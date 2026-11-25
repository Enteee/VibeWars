/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Populate maps, the survey (#4004): every map's plan with its empty areas
// outlined, and a table ranking the maps by empty walkable ground.
// "Empty" is ground where a disc 120 u across (about four bodies) touches
// nothing but ground grain: no wall, edge, pit, water, zone, stair, roof,
// gate, objective, spawn, lever or fire mark. Paving counts as ground.
// Usage: [VIBEWARS_CHROMIUM=<chromium>] node scripts/assets/populate-survey.mjs <out-dir> [map-id]...
// Prints the table as markdown; writes <out-dir>/<map>.png, and for the
// three emptiest maps <map>-before.svg and <map>-after.svg, the kit placed.
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { corners, planSvg, readMap, renderPngs } from "./map-plan-lib.mjs";

/** @typedef {import("./map-plan-lib.mjs").MapData} MapData */
/** @typedef {import("./map-plan-lib.mjs").Shape} Shape */
/** @typedef {import("./map-plan-lib.mjs").Pt} Pt */

/** World units per survey cell. */
const CELL = 10;
/** The smallest empty area, across: about four bodies. */
const EMPTY_ACROSS = 120;
/** Around a point feature, what it takes up: a spawn's bubble, a lever's post. */
const POINT_RADIUS = { spawn: 80, objective: 80, lever: 30, fireMark: 30, dropOff: 30 };
/** Empty ground per decor cluster: about one per 250 u square, as lights are placed. */
const CLUSTER_AREA = 250 * 250;
/** Sprites in one cluster: a boulder group, a fallen tree and its stones. */
const SPRITES_PER_CLUSTER = 4;
/** Maps mocked up before and after, the emptiest first. */
const MOCKUPS = 3;
const OUTLINE = "#ff4fd8";

const [outDir, ...only] = process.argv.slice(2);
if (outDir === undefined) {
  throw new Error("usage: populate-survey.mjs <out-dir> [map-id]...");
}
const ids =
  only.length > 0
    ? only
    : readdirSync("packages/game-maps/maps", { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

/**
 * Whether (x, y) is inside `shape`.
 *
 * @param {Shape} shape
 * @param {number} x
 * @param {number} y
 */
function inside(shape, x, y) {
  if (shape.kind === "rect") {
    return x >= shape.x && x < shape.x + shape.width && y >= shape.y && y < shape.y + shape.height;
  }
  const p = shape.points;
  let hit = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i, i += 1) {
    const a = p[i];
    const b = p[j];
    if (a !== undefined && b !== undefined && a.y > y !== b.y > y) {
      if (x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
        hit = !hit;
      }
    }
  }
  return hit;
}

/**
 * The survey of one map.
 *
 * @param {MapData} map
 */
function survey(map) {
  const W = Math.ceil(map.width / CELL);
  const H = Math.ceil(map.height / CELL);
  const at = (/** @type {number} */ cx, /** @type {number} */ cy) => cy * W + cx;
  // The layer a cell is walked on, or -1. Decks on one layer that overlap
  // are one floor: only a change of layer is an edge.
  const surface = new Int16Array(W * H).fill(-1);
  // Something other than ground grain stands on the cell.
  const taken = new Uint8Array(W * H);

  /** @type {(shape: Shape, paint: (i: number) => void) => void} */
  const fill = (shape, paint) => {
    const cs = corners(shape);
    const xs = cs.map(([x]) => x);
    const ys = cs.map(([, y]) => y);
    const x0 = Math.max(0, Math.floor(Math.min(...xs) / CELL));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs) / CELL));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) / CELL));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys) / CELL));
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        if (inside(shape, (cx + 0.5) * CELL, (cy + 0.5) * CELL)) {
          paint(at(cx, cy));
        }
      }
    }
  };
  /** @type {(p: Pt, r: number) => void} */
  const disc = (p, r) => {
    fill({ kind: "rect", x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r }, (i) => {
      const cx = (i % W) + 0.5;
      const cy = Math.floor(i / W) + 0.5;
      if (Math.hypot(cx * CELL - p.x, cy * CELL - p.y) <= r) {
        taken[i] = 1;
      }
    });
  };
  const take = (/** @type {number} */ i) => {
    taken[i] = 1;
  };
  const none = (/** @type {number} */ i) => {
    surface[i] = -1;
  };
  /** `paint` only where the cell is walked on `layer`: a deck stands on the walls under it. */
  const on =
    (/** @type {number} */ layer, /** @type {(i: number) => void} */ paint) =>
    (/** @type {number} */ i) => {
      if (surface[i] === layer) paint(i);
    };

  /** @type {Shape} */
  const ground =
    map.bounds.kind === "outline"
      ? { kind: "polygon", points: map.bounds.outline }
      : { kind: "rect", x: 0, y: 0, width: map.width, height: map.height };
  fill(ground, (i) => {
    surface[i] = map.groundLayer;
  });
  for (const below of [...map.pits, ...map.tunnels]) fill(below.footprint, none);
  for (const deck of [...map.decks].sort((a, b) => a.layer - b.layer)) {
    fill(deck.footprint, (i) => {
      surface[i] = deck.layer;
    });
  }
  for (const body of map.water ?? []) {
    fill(body.area, on(body.layer, body.depth === "deep" ? none : take));
  }
  for (const wall of [
    ...map.walls,
    ...map.gates.map((gate) => gate.wall),
    ...(map.breakables ?? []).map((b) => b.wall),
  ]) {
    fill(wall, on(wall.layer, none));
  }
  for (const zone of map.zones ?? []) fill(zone.area, on(zone.layer, take));
  for (const t of map.transitions) fill(t.area, take);
  for (const roof of map.overhangs ?? []) fill(roof.footprint, take);
  for (const port of map.teleports ?? []) fill(port.from.area, take);
  for (const goal of map.objectives ?? []) {
    if (goal.area !== undefined) fill(goal.area, on(goal.layer, take));
    if (goal.position !== undefined) disc(goal.position, POINT_RADIUS.objective);
  }
  for (const spawn of map.spawnPoints) disc(spawn.position, POINT_RADIUS.spawn);
  for (const lever of map.switches ?? []) disc(lever.position, POINT_RADIUS.lever);
  for (const drop of map.dropOffs) {
    disc(drop.from, POINT_RADIUS.dropOff);
    disc(drop.to, POINT_RADIUS.dropOff);
  }
  for (const light of map.lighting?.lights ?? []) {
    if (/^(torch|fire|brazier)-/.test(light.id)) disc(light.position, POINT_RADIUS.fireMark);
  }

  // Free: walkable, nothing on it, and not on a surface's edge.
  const free = new Uint8Array(W * H);
  let walkable = 0;
  for (let cy = 0; cy < H; cy += 1) {
    for (let cx = 0; cx < W; cx += 1) {
      const i = at(cx, cy);
      const here = surface[i] ?? -1;
      if (here < 0) continue;
      walkable += 1;
      const edge =
        cx === 0 ||
        cy === 0 ||
        cx === W - 1 ||
        cy === H - 1 ||
        surface[i - 1] !== here ||
        surface[i + 1] !== here ||
        surface[i - W] !== here ||
        surface[i + W] !== here;
      free[i] = taken[i] === 1 || edge ? 0 : 1;
    }
  }
  // Empty: within a free disc EMPTY_ACROSS wide. Centres first, then the
  // discs round them.
  const radius = EMPTY_ACROSS / 2 / CELL;
  const toTaken = chamfer(free, W, H);
  const centre = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) centre[i] = (toTaken[i] ?? 0) >= radius ? 1 : 0;
  const notCentre = centre.map((c) => 1 - c);
  const toCentre = chamfer(notCentre, W, H);
  const empty = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    empty[i] = free[i] === 1 && (toCentre[i] ?? Infinity) <= radius ? 1 : 0;
  }
  const regions = components(empty, W, H);
  const emptyCells = regions.reduce((sum, r) => sum + r.cells.length, 0);
  const emptyArea = emptyCells * CELL * CELL;
  const clusters = regions.reduce(
    (sum, r) => sum + Math.max(1, Math.round((r.cells.length * CELL * CELL) / CLUSTER_AREA)),
    0,
  );
  return {
    W,
    H,
    empty,
    centre,
    surface,
    regions,
    walkableArea: walkable * CELL * CELL,
    emptyArea,
    share: walkable === 0 ? 0 : emptyCells / walkable,
    clusters,
  };
}

/**
 * Each cell's distance, in cells, to the nearest cell where `mask` is 0
 * (two-pass chamfer, 1 and √2).
 *
 * @param {Uint8Array} mask
 * @param {number} W
 * @param {number} H
 */
function chamfer(mask, W, H) {
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) d[i] = mask[i] === 1 ? Infinity : 0;
  const D = Math.SQRT2;
  const get = (/** @type {number} */ x, /** @type {number} */ y) =>
    x < 0 || y < 0 || x >= W || y >= H ? 0 : (d[y * W + x] ?? 0);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      d[i] = Math.min(
        d[i] ?? 0,
        get(x - 1, y) + 1,
        get(x, y - 1) + 1,
        get(x - 1, y - 1) + D,
        get(x + 1, y - 1) + D,
      );
    }
  }
  for (let y = H - 1; y >= 0; y -= 1) {
    for (let x = W - 1; x >= 0; x -= 1) {
      const i = y * W + x;
      d[i] = Math.min(
        d[i] ?? 0,
        get(x + 1, y) + 1,
        get(x, y + 1) + 1,
        get(x + 1, y + 1) + D,
        get(x - 1, y + 1) + D,
      );
    }
  }
  return d;
}

/**
 * The 4-connected regions of `mask`, largest first.
 *
 * @param {Uint8Array} mask
 * @param {number} W
 * @param {number} H
 * @returns {{ cells: number[] }[]}
 */
function components(mask, W, H) {
  const seen = new Uint8Array(W * H);
  /** @type {{ cells: number[] }[]} */
  const out = [];
  for (let start = 0; start < W * H; start += 1) {
    if (mask[start] !== 1 || seen[start] === 1) continue;
    const cells = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = /** @type {number} */ (stack.pop());
      cells.push(i);
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j >= 0 && j < W * H && mask[j] === 1 && seen[j] !== 1) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    out.push({ cells });
  }
  return out.sort((a, b) => b.cells.length - a.cells.length);
}

/**
 * The empty cells' outline and a light wash, as SVG in plan pixels.
 *
 * @param {ReturnType<typeof survey>} result
 * @param {number} k
 */
function outline(result, k) {
  const { W, H, empty } = result;
  const c = CELL * k;
  let wash = "";
  let edges = "";
  for (let y = 0; y < H; y += 1) {
    // Runs, so the wash is one rect per row of cells.
    let run = -1;
    for (let x = 0; x <= W; x += 1) {
      const on = x < W && empty[y * W + x] === 1;
      if (on && run < 0) run = x;
      if (!on && run >= 0) {
        wash += `M${(run * c).toFixed(1)} ${(y * c).toFixed(1)}h${((x - run) * c).toFixed(1)}v${c.toFixed(1)}h${(-(x - run) * c).toFixed(1)}z`;
        run = -1;
      }
      if (!on) continue;
      const i = y * W + x;
      const [px, py] = [x * c, y * c];
      if (y === 0 || empty[i - W] !== 1)
        edges += `M${px.toFixed(1)} ${py.toFixed(1)}h${c.toFixed(1)}`;
      if (y === H - 1 || empty[i + W] !== 1)
        edges += `M${px.toFixed(1)} ${(py + c).toFixed(1)}h${c.toFixed(1)}`;
      if (x === 0 || empty[i - 1] !== 1)
        edges += `M${px.toFixed(1)} ${py.toFixed(1)}v${c.toFixed(1)}`;
      if (x === W - 1 || empty[i + 1] !== 1)
        edges += `M${(px + c).toFixed(1)} ${py.toFixed(1)}v${c.toFixed(1)}`;
    }
  }
  return `<path d="${wash}" fill="${OUTLINE}" opacity=".22"/><path d="${edges}" fill="none" stroke="${OUTLINE}" stroke-width="2"/>`;
}

/** Empty share at which a map is "some gaps", then "empty": almost every map is mostly bare floor, so "empty" means most of it. */
const VERDICT = [
  [0.7, "empty"],
  [0.15, "some gaps"],
  [0, "full"],
];

/**
 * The kit each biome is populated from, as the study proposes: the first
 * two kinds stand alone, the last scatters round them.
 *
 * @type {Record<string, [string, string, string]>}
 */
const KIT = {
  hall: ["column", "crates", "banner"],
  heights: ["boulder", "column", "banner"],
  wilds: ["tree", "boulder", "rocks"],
  desert: ["column", "boulder", "bones"],
  volcanic: ["boulder", "vent", "bones"],
  snow: ["ice-spikes", "tree", "rocks"],
  marsh: ["dead-tree", "reeds", "bones"],
  jungle: ["tree", "column", "reeds"],
  coast: ["crates", "reeds", "rocks"],
  cavern: ["boulder", "mushrooms", "bones"],
};

/**
 * One kit element at (x, y), map units times `k`: its contact shadow
 * (visual-style §3, 5 right and 6 down), then its body.
 *
 * @param {string} kind
 * @param {number} x
 * @param {number} y
 * @param {number} k
 */
function glyph(kind, x, y, k) {
  const X = (/** @type {number} */ u) => (x + u) * k;
  const Y = (/** @type {number} */ u) => (y + u) * k;
  const r = (/** @type {number} */ u) => (u * k).toFixed(1);
  const at = (/** @type {number} */ dx, /** @type {number} */ dy) =>
    `${X(dx).toFixed(1)} ${Y(dy).toFixed(1)}`;
  const disc = (
    /** @type {number} */ dx,
    /** @type {number} */ dy,
    /** @type {number} */ u,
    /** @type {string} */ fill,
  ) => `<circle cx="${X(dx).toFixed(1)}" cy="${Y(dy).toFixed(1)}" r="${r(u)}" fill="${fill}"/>`;
  const shadow = (/** @type {number} */ u) => disc(5, 6, u, "#0009");
  switch (kind) {
    case "boulder":
      return shadow(45) + disc(0, 0, 45, "#6d6a66") + disc(-8, -10, 30, "#8e8a84");
    case "column":
      return (
        shadow(20) +
        disc(0, 0, 20, "#d8cdb4") +
        `<rect x="${X(25).toFixed(1)}" y="${Y(-8).toFixed(1)}" width="${r(50)}" height="${r(18)}" fill="#bfb398"/>`
      );
    case "crates":
      return `<rect x="${X(-25).toFixed(1)}" y="${Y(-25).toFixed(1)}" width="${r(50)}" height="${r(50)}" fill="#7a5a34" stroke="#3d2c19"/>`;
    case "tree":
      return shadow(55) + disc(0, 0, 55, "#2f6b2f") + disc(-12, -14, 34, "#3f8a3a");
    case "dead-tree":
      return (
        shadow(12) +
        `<path d="M${at(0, 0)}L${at(-40, -30)}M${at(0, 0)}L${at(35, -35)}M${at(0, 0)}L${at(10, 40)}" stroke="#4a3a2a" stroke-width="${r(10)}"/>`
      );
    case "ice-spikes":
      return (
        shadow(30) +
        `<path d="M${at(-30, 20)}L${at(-10, -40)}L${at(5, 20)}zM${at(0, 20)}L${at(20, -30)}L${at(35, 20)}z" fill="#bfe3f2" stroke="#7fb4cc"/>`
      );
    case "vent":
      return disc(0, 0, 30, "#ff8a2a66") + disc(0, 0, 14, "#2a1a14");
    case "mushrooms":
      return disc(-14, 0, 10, "#5ff2d2") + disc(10, -8, 8, "#5ff2d2") + disc(4, 12, 7, "#5ff2d2");
    case "banner":
      return `<rect x="${X(-6).toFixed(1)}" y="${Y(-30).toFixed(1)}" width="${r(12)}" height="${r(40)}" fill="#a3302a"/>`;
    case "bones":
      return `<path d="M${at(-20, -6)}L${at(20, 6)}M${at(-10, 14)}L${at(14, -12)}" stroke="#ece3cf" stroke-width="${r(6)}"/>`;
    case "reeds":
      return `<path d="M${at(-15, 15)}L${at(-20, -25)}M${at(0, 15)}L${at(0, -30)}M${at(15, 15)}L${at(22, -22)}" stroke="#6f8f3a" stroke-width="${r(5)}"/>`;
    default:
      return disc(0, 0, 10, "#8a8580") + disc(14, 6, 8, "#8a8580") + disc(-4, 12, 7, "#77736e");
  }
}

/**
 * The kit placed on a map's empty ground: one cluster per CLUSTER_AREA
 * square that holds a disc centre, its main element alternating between
 * the biome's first two kinds, and one scattered beside it.
 *
 * @param {MapData} map
 * @param {ReturnType<typeof survey>} result
 * @param {number} k
 */
function populated(map, result, k) {
  const kit = KIT[map.biome];
  if (kit === undefined) throw new Error(`${map.name}: no kit for biome ${map.biome}`);
  const step = Math.round(Math.sqrt(CLUSTER_AREA) / CELL);
  let s = "";
  let n = 0;
  const place = (/** @type {number} */ slot, /** @type {number} */ px, /** @type {number} */ py) =>
    `<use href="#k${slot}" x="${Math.round(px * k)}" y="${Math.round(py * k)}"/>`;
  for (let gy = 0; gy < result.H; gy += step) {
    for (let gx = 0; gx < result.W; gx += step) {
      // The disc centre nearest the square's middle.
      let best = -1;
      let bestD = Infinity;
      for (let cy = gy; cy < Math.min(gy + step, result.H); cy += 1) {
        for (let cx = gx; cx < Math.min(gx + step, result.W); cx += 1) {
          if (result.centre[cy * result.W + cx] !== 1) continue;
          const d = (cx - gx - step / 2) ** 2 + (cy - gy - step / 2) ** 2;
          if (d < bestD) [best, bestD] = [cy * result.W + cx, d];
        }
      }
      if (best < 0) continue;
      const x = (best % result.W) * CELL + CELL / 2;
      const y = Math.floor(best / result.W) * CELL + CELL / 2;
      s += place(n % 2, x, y) + place(2, x + 70, y + 40);
      n += 1;
    }
  }
  // Each kind drawn once, at the origin; every cluster refers to it.
  const defs = kit.map((kind, i) => `<g id="k${i}">${glyph(kind, 0, 0, k)}</g>`).join("");
  return `<defs>${defs}</defs>${s}`;
}

/** @type {{ id: string, name: string, biome: string, share: number, emptyArea: number, regions: number, largest: number, clusters: number, verdict: string }[]} */
const rows = [];
/** @type {{ svg: string, width: number, height: number, out: string }[]} */
const shots = [];
/** @type {Map<string, { map: MapData, result: ReturnType<typeof survey> }>} */
const surveyed = new Map();
for (const id of ids) {
  const map = readMap(id);
  const result = survey(map);
  surveyed.set(id, { map, result });
  const verdict = VERDICT.find(([at]) => result.share >= Number(at))?.[1] ?? "full";
  const largest = (result.regions[0]?.cells.length ?? 0) * CELL * CELL;
  rows.push({
    id,
    name: map.name,
    biome: map.biome,
    share: result.share,
    emptyArea: result.emptyArea,
    regions: result.regions.length,
    largest,
    clusters: result.clusters,
    verdict: String(verdict),
  });
  const legend = `outlined: empty ground, ${Math.round(result.share * 100)} % of the walkable (a ${EMPTY_ACROSS} u disc touches nothing) · ${verdict}`;
  shots.push({
    ...planSvg(map, { overlay: (k) => outline(result, k), legend }),
    out: path.join(outDir, `${id}.png`),
  });
}
await renderPngs(shots);

rows.sort((a, b) => b.share - a.share);
const kU2 = (/** @type {number} */ a) => `${Math.round(a / 1000)}k`;
console.log(
  "| # | Map | Biome | Empty, % of walkable | Empty, u² | Regions | Largest, u² | Clusters (sprites) | Verdict |",
);
console.log("| -: | --- | --- | -: | -: | -: | -: | -: | --- |");
rows.forEach((row, index) => {
  console.log(
    `| ${index + 1} | [${row.name}](populate/${row.id}.png) \`${row.id}\` | ${row.biome} | ${Math.round(row.share * 100)} | ${kU2(row.emptyArea)} | ${row.regions} | ${kU2(row.largest)} | ${row.clusters} (${row.clusters * SPRITES_PER_CLUSTER}) | ${row.verdict} |`,
  );
});

// The mockups: the three emptiest maps, before and after the kit.
for (const row of rows.slice(0, MOCKUPS)) {
  const done = surveyed.get(row.id);
  if (done === undefined) continue;
  const { map, result } = done;
  const kit = KIT[map.biome]?.join(", ") ?? "";
  const before = planSvg(map, { legend: `before: as it is` });
  const after = planSvg(map, {
    overlay: (k) => populated(map, result, k),
    legend: `after: the ${map.biome} kit (${kit}), about one cluster per ${Math.sqrt(CLUSTER_AREA)} u square`,
  });
  writeFileSync(path.join(outDir, `${row.id}-before.svg`), before.svg);
  writeFileSync(path.join(outDir, `${row.id}-after.svg`), after.svg);
}
