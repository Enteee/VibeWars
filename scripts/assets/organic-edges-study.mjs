/* eslint-disable -- an SVG generator: untyped helpers, numbers go into strings everywhere. */
// Draws the organic-edges study (#4251): water, hazard zones, the map's edge
// and paving, authored beside roughened, on three real maps. A design
// reference, not a game asset. Deterministic: no Math.random, the same output
// every run.
//
//   node scripts/assets/organic-edges-study.mjs
//
// Writes docs/art/organic-edges-study.png (via inkscape; its svg goes to the temp dir, 4 MB) and .md. The
// shapes are read from packages/game-maps/maps/<id>/map.json. The look is the
// game's own numbers (WATER_LOOK, ZONE_LOOK, OUTSIDE_EDGE), drawn here as
// SVG, with the biome tones graded dark as arena-palette.ts does.
//
// `roughen` below is the algorithm the .md proposes; the implementation
// cards port it, so it takes only plain points and numbers.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const base = join(root, "docs", "art", "organic-edges-study");
const OUTLINE = "#08080a";

// ---------------------------------------------------------------------------
// The algorithm: deterministic, shareable by the sim and the renderer.

/** FNV-1a, 32 bit: a seed from a string. */
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** A lattice value in [0, 1) from a seed and two integers. */
function lattice(seed, ix, iy) {
  let h = Math.imul(seed ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263), 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
/** 2D value noise in [0, 1). */
function noise2(seed, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = lattice(seed, ix, iy);
  const b = lattice(seed, ix + 1, iy);
  const c = lattice(seed, ix, iy + 1);
  const d = lattice(seed, ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/**
 * The displacement field at a point, in [-1, 1]: three octaves, weights
 * 0.57 / 0.29 / 0.14 (visual-style §4), wavelengths F, F/2, F/4. The first
 * octave is seeded by the map and the element's group, so a shallow inside
 * its deep water drifts with it; the other two by the element's own id.
 */
function field(groupSeed, ownSeed, x, y, F) {
  const o1 = noise2(groupSeed, x / F, y / F);
  const o2 = noise2(ownSeed, x / (F / 2) + 17.3, y / (F / 2) - 5.1);
  const o3 = noise2(ownSeed + 1, x / (F / 4) - 9.7, y / (F / 4) + 31.9);
  return Math.max(-1, Math.min(1, ((0.57 * o1 + 0.29 * o2 + 0.14 * o3) * 2 - 1) * 2.2));
}

const area2 = (p) =>
  p.reduce((s, a, i) => s + (a.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * a.y), 0);
function segCross(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
/** True when no two edges of the closed polygon cross. */
function simple(p) {
  const n = p.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segCross(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return false;
    }
  }
  return true;
}
function crosses(p, q) {
  for (let i = 0; i < p.length; i++)
    for (let j = 0; j < q.length; j++)
      if (segCross(p[i], p[(i + 1) % p.length], q[j], q[(j + 1) % q.length])) return true;
  return false;
}

/**
 * Roughen a closed polygon. Every edge is cut into segments of at most `L`
 * units; every point moves along the local normal by `A * field`, and
 * moves less inside `keep` (spawns and objectives): not at all within 60
 * units, fully at 120. The result is simple and crosses nothing in `others`
 * that the authored shape did not cross; a shape that lay inside `inside`
 * stays inside it. A point on another element's authored edge (`pin`) does
 * not move, so shapes that meet keep meeting. If a check fails, the
 * amplitude halves, up to three times, then the shape stays as authored.
 *
 * @param {{x:number,y:number}[]} poly
 * @param {{ L: number, A: number, F: number, group: string, id: string, keep: {x:number,y:number}[], others: {x:number,y:number}[][], pin: {x:number,y:number}[][], inside: {x:number,y:number}[] | null }} o
 */
function roughen(poly, o) {
  const groupSeed = hashString(o.group);
  const ownSeed = hashString(o.id);
  const sign = Math.sign(area2(poly)) || 1;
  const cut = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / o.L));
    for (let k = 0; k < n; k++)
      cut.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  const normal = (i) => {
    const p = cut[(i + cut.length - 1) % cut.length];
    const q = cut[(i + 1) % cut.length];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: (dy / len) * sign, y: (-dx / len) * sign };
  };
  const onEdge = (pt, q) => {
    for (let i = 0; i < q.length; i++) {
      const a = q[i];
      const b = q[(i + 1) % q.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
      );
      if (Math.hypot(pt.x - (a.x + dx * t), pt.y - (a.y + dy * t)) < 2) return true;
    }
    return false;
  };
  const inPoly = (pt, q) => {
    let on = false;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
      if (
        q[i].y > pt.y !== q[j].y > pt.y &&
        pt.x < ((q[j].x - q[i].x) * (pt.y - q[i].y)) / (q[j].y - q[i].y) + q[i].x
      )
        on = !on;
    }
    return on;
  };
  const calm = (pt) => {
    if (o.pin.some((q) => onEdge(pt, q))) return 0;
    let d = 1e9;
    for (const k of o.keep) d = Math.min(d, Math.hypot(pt.x - k.x, pt.y - k.y));
    return Math.max(0, Math.min(1, (d - 60) / 60));
  };
  const crossedBefore = o.others.map((q) => crosses(poly, q));
  for (let tries = 0, A = o.A; tries < 4; tries++, A /= 2) {
    const out = cut.map((pt, i) => {
      const nrm = normal(i);
      const d = A * field(groupSeed, ownSeed, pt.x, pt.y, o.F) * calm(pt);
      return { x: Math.round(pt.x + nrm.x * d), y: Math.round(pt.y + nrm.y * d) };
    });
    if (
      simple(out) &&
      o.others.every((q, i) => crossedBefore[i] || !crosses(out, q)) &&
      (!o.inside || out.every((pt) => inPoly(pt, o.inside)))
    )
      return { points: out, A, tries };
  }
  return { points: poly, A: 0, tries: 4 };
}

// ---------------------------------------------------------------------------
// The maps.

const load = (id) =>
  JSON.parse(readFileSync(join(root, "packages", "game-maps", "maps", id, "map.json"), "utf8"));
const shapeOf = (a) =>
  a.kind === "polygon"
    ? a.points.map((p) => ({ ...p }))
    : [
        { x: a.x, y: a.y },
        { x: a.x + a.width, y: a.y },
        { x: a.x + a.width, y: a.y + a.height },
        { x: a.x, y: a.y + a.height },
      ];

const insideAuth = (pt, q) => {
  let on = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    if (
      q[i].y > pt.y !== q[j].y > pt.y &&
      pt.x < ((q[j].x - q[i].x) * (pt.y - q[i].y)) / (q[j].y - q[i].y) + q[i].x
    )
      on = !on;
  }
  return on;
};

const KINDS = {
  water: { L: 36, A: 56, F: 190, shallowA: 56 },
  zone: { L: 40, A: 24, F: 200 },
  edge: { L: 30, A: 40, F: 260 },
  paving: { L: 20, A: 9, F: 100 },
};

/** Authored and organic shapes of a map's water, zones, outline, paving. */
function build(id) {
  const m = load(id);
  const keep = [
    ...m.spawnPoints.map((s) => s.position),
    ...m.objectives.map((o) => o.position ?? o.centre ?? o).filter((p) => typeof p.x === "number"),
  ];
  const kinds = KINDS;
  const _unused = {
    water: { L: 36, A: 56, F: 190, shallowA: 56 },
    zone: { L: 40, A: 24, F: 200 },
    edge: { L: 30, A: 40, F: 260 },
    paving: { L: 20, A: 9, F: 100 },
  };
  const els = [];
  for (const w of [...(m.water ?? [])].sort(
    (a, b) => (a.depth === "deep" ? 0 : 1) - (b.depth === "deep" ? 0 : 1),
  ))
    els.push({ type: "water", id: w.id, layer: w.layer, depth: w.depth, auth: shapeOf(w.area) });
  for (const z of m.zones ?? [])
    els.push({ type: "zone", id: z.id, layer: z.layer, zone: z.kind, auth: shapeOf(z.area) });
  for (const p of m.paving ?? []) els.push({ type: "paving", id: p.id, auth: shapeOf(p.area) });
  els.push({ type: "edge", id: "outline", auth: m.bounds.outline.map((p) => ({ ...p })) });
  const report = [];
  for (const e of els) {
    const k = kinds[e.type];
    const A = e.type === "water" && e.depth === "shallow" ? k.shallowA : k.A;
    const peers = els.filter(
      (x) => x !== e && x.type === e.type && x.type !== "paving" && x.type !== "edge",
    );
    const same = peers.filter((x) => x.layer === e.layer);
    const container =
      e.type === "water" && e.depth === "shallow"
        ? peers.find((x) => x.depth === "deep" && e.auth.every((pt) => insideAuth(pt, x.auth)))
        : undefined;
    const r = roughen(e.auth, {
      L: k.L,
      A,
      F: k.F,
      group: `${id}:${e.type}`,
      id: `${id}:${e.id}`,
      keep,
      others: same.map((x) => x.org ?? x.auth),
      pin: peers.filter((x) => x !== container).map((x) => x.auth),
      inside: container ? container.org : null,
    });
    e.org = r.points;
    e.used = r;
  }
  return { id, m, els, keep };
}

const MAPS = [build("blackwater-ford"), build("ember-pits"), build("moss-vale")];

// ---------------------------------------------------------------------------
// The look: the game's numbers, drawn as SVG (tones graded dark).

const FLOOR = { marsh: "#1f2823", volcanic: "#1b1614", wilds: "#1c241d" };
const OUTSIDE = {
  rock: {
    base: "#2a2825",
    grain: ["#23211f", "#34312d"],
    crevice: "#0e0d0b",
    rim: "#8a857a",
    chunk: "#3b3834",
  },
  basalt: {
    base: "#100e0d",
    grain: ["#0c0b0a", "#171413"],
    crevice: "#080706",
    rim: "#6a625c",
    ember: "#6e3018",
    chunk: "#2a2522",
  },
  forest: {
    base: "#141e16",
    grain: ["#101810", "#19261b"],
    shadow: "#0a100b",
    rim: "#2c4a2e",
    chunk: "#22381f",
    lit: "#3f6a3d",
  },
};
const WATER = {
  deep: { fill: "#0e2228", lip: "#2a3a46", ripple: "#b4d2dc", ring: "#040c10" },
  shallow: { fill: "#5ea8b8", alpha: 0.5, shore: "#a8d8e0", ripple: "#d2ecf2" },
};
const ZONE = {
  scorched: { fill: "#b8401a", edge: "#ff8a3d", alpha: 0.38 },
  molten: { fill: "#ff5a1f", edge: "#ffd23d", alpha: 0.55 },
  vent: { fill: "#ff4a12", edge: "#ffb03d", alpha: 0.6 },
  mire: { fill: "#6b4a26", edge: "#9c7a46", alpha: 0.5 },
  spring: { fill: "#3f9fe8", edge: "#9fdcff", alpha: 0.34 },
};
const PAVE = { bed: "#2d261d", edge: "#16120d", stone: "#4a4034" };

const f = (n) => String(Math.round(n * 10) / 10);
const pts = (p) => p.map((q) => `${f(q.x)},${f(q.y)}`).join(" ");
const rng = (seed) => {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
};

let defId = 0;
/** A clip path of a polygon; returns its id. */
function clipOf(defs, p) {
  const id = `c${defId++}`;
  defs.push(`<clipPath id="${id}"><polygon points="${pts(p)}"/></clipPath>`);
  return id;
}
/** A polygon's perimeter points, evenly spaced `step` apart. */
function along(p, step) {
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++)
      out.push({
        x: a.x + ((b.x - a.x) * k) / n,
        y: a.y + ((b.y - a.y) * k) / n,
        dx: (b.x - a.x) / len,
        dy: (b.y - a.y) / len,
      });
  }
  return out;
}
const outward = (p) => (area2(p) > 0 ? 1 : -1);

/** Water: the game's deep (a lip, a dark body, rings) and shallow (a pale film, a shore line). */
function paintWater(out, defs, e, p, seed) {
  if (e.depth === "deep") {
    const c = clipOf(defs, p);
    out.push(`<polygon points="${pts(p)}" fill="${WATER.deep.fill}"/>`);
    out.push(`<g clip-path="url(#${c})">`);
    for (const [w, a] of [
      [56, 0.3],
      [34, 0.3],
      [18, 0.3],
    ])
      out.push(
        `<polygon points="${pts(p)}" fill="none" stroke="${WATER.deep.ring}" stroke-opacity="${a}" stroke-width="${w}" transform="translate(0 0)"/>`,
      );
    out.push(
      `<polygon points="${pts(p)}" fill="none" stroke="${WATER.deep.lip}" stroke-width="12"/>`,
    );
    out.push("</g>");
    out.push(
      `<polygon points="${pts(p)}" fill="none" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>`,
    );
  } else {
    out.push(
      `<polygon points="${pts(p)}" fill="${WATER.shallow.fill}" fill-opacity="${WATER.shallow.alpha}"/>`,
    );
    out.push(
      `<polygon points="${pts(p)}" fill="none" stroke="${WATER.shallow.shore}" stroke-width="1.2" stroke-linejoin="round"/>`,
    );
  }
  // ripples: short light strokes at a stable lattice, inside the shape
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => q.y);
  const c2 = clipOf(defs, p);
  const r = rng(seed);
  out.push(
    `<g clip-path="url(#${c2})" stroke="${e.depth === "deep" ? WATER.deep.ripple : WATER.shallow.ripple}" stroke-opacity="${e.depth === "deep" ? 0.3 : 0.4}" stroke-width="1.2" stroke-linecap="round">`,
  );
  for (let y = Math.min(...ys); y < Math.max(...ys); y += 46) {
    for (let x = Math.min(...xs); x < Math.max(...xs); x += 46) {
      const jx = x + r() * 30;
      const jy = y + r() * 30;
      out.push(`<line x1="${f(jx)}" y1="${f(jy)}" x2="${f(jx + 12)}" y2="${f(jy)}"/>`);
    }
  }
  out.push("</g>");
}

/**
 * A zone: its fill under a hard 2 px edge. Treatments (visual-style §4, "never
 * softer than its fill"):
 *   A  the hard edge only, on the shape as given;
 *   B  the hard edge plus a soft feather OUTSIDE it (the floor blends in);
 *   C  the hard edge plus a ragged inner crust line (the ground cracks in).
 */
function paintZone(out, defs, e, p, treat, seed) {
  const z = ZONE[e.zone];
  const feather = e.zone === "mire" || e.zone === "spring" ? 22 : 9;
  if (treat === "B") {
    const id = `blur${defId++}`;
    defs.push(
      `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${feather / 2}"/></filter>`,
    );
    out.push(
      `<polygon points="${pts(p)}" fill="none" stroke="${z.fill}" stroke-opacity="${e.zone === "mire" || e.zone === "spring" ? 0.3 : 0.4}" stroke-width="${feather * 2}" stroke-linejoin="round" filter="url(#${id})"/>`,
    );
  }
  out.push(`<polygon points="${pts(p)}" fill="${z.fill}" fill-opacity="${z.alpha}"/>`);
  const c = clipOf(defs, p);
  const r = rng(seed);
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => q.y);
  out.push(`<g clip-path="url(#${c})" fill="${z.edge}" fill-opacity="0.22">`);
  for (let i = 0; i < 40; i++)
    out.push(
      `<circle cx="${f(Math.min(...xs) + r() * (Math.max(...xs) - Math.min(...xs)))}" cy="${f(Math.min(...ys) + r() * (Math.max(...ys) - Math.min(...ys)))}" r="${f(2 + r() * 4)}"/>`,
    );
  out.push("</g>");
  if (treat === "C") {
    const inner = along(p, 14);
    const s = outward(p);
    const rr = rng(seed + 5);
    const line = inner.map((q) => ({
      x: q.x - q.dy * s * (4 + rr() * 6),
      y: q.y + q.dx * s * (4 + rr() * 6),
    }));
    out.push(
      `<polygon points="${pts(line)}" fill="none" stroke="${z.edge}" stroke-opacity="0.5" stroke-width="1.2" stroke-linejoin="round" stroke-dasharray="10 5"/>`,
    );
  }
  out.push(
    `<polygon points="${pts(p)}" fill="none" stroke="${z.edge}" stroke-width="2" stroke-linejoin="round"/>`,
  );
}

/** Paving: a bed with a darker border; the organic one scatters stones over its edge. */
function paintPaving(out, p, organic, seed) {
  out.push(
    `<polygon points="${pts(p)}" fill="none" stroke="${PAVE.edge}" stroke-opacity="0.2" stroke-width="8" stroke-linejoin="round"/>`,
  );
  out.push(
    `<polygon points="${pts(p)}" fill="none" stroke="${PAVE.edge}" stroke-opacity="0.45" stroke-width="4" stroke-linejoin="round"/>`,
  );
  out.push(
    `<polygon points="${pts(p)}" fill="${PAVE.bed}" stroke="${OUTLINE}" stroke-opacity="0.5" stroke-width="1" stroke-linejoin="round"/>`,
  );
  if (organic) {
    const r = rng(seed);
    const s = outward(p);
    for (const q of along(p, 11)) {
      const d = (r() - 0.55) * 9;
      out.push(
        `<ellipse cx="${f(q.x + -q.dy * s * d)}" cy="${f(q.y + q.dx * s * d)}" rx="${f(1.6 + r() * 2.2)}" ry="${f(1.2 + r() * 1.6)}" fill="${PAVE.stone}" stroke="${OUTLINE}" stroke-width="0.6"/>`,
      );
    }
  }
}

/** The map's edge, outside material and bands. `organic` swaps the offset bands for a broken rim with chunks. */
function paintEdge(out, defs, kind, p, organic, seed, view) {
  const L = OUTSIDE[kind];
  const s = outward(p);
  // Outside = the whole view minus the ground: an even-odd path.
  const [vx, vy, vw, vh] = view;
  const hole = `M${pts([
    { x: vx - 50, y: vy - 50 },
    { x: vx + vw + 50, y: vy - 50 },
    { x: vx + vw + 50, y: vy + vh + 50 },
    { x: vx - 50, y: vy + vh + 50 },
  ]).replace(/ /g, " L")} Z M${pts(p).replace(/ /g, " L")} Z`;
  out.push(`<path d="${hole}" fill="${L.base}" fill-rule="evenodd"/>`);
  const c = clipOf(defs, p);
  const r = rng(seed);
  // grain of the outside
  out.push(`<g fill-opacity="0.8">`);
  for (let i = 0; i < 360; i++) {
    const x = vx + r() * vw;
    const y = vy + r() * vh;
    out.push(
      `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2 + r() * 5)}" fill="${L.grain[i % 2]}" clip-path="none" class="o"/>`,
    );
  }
  out.push("</g>");
  // The ground is painted after, over the grain that fell inside the outline.
  out.push(`<polygon points="${pts(p)}" fill="${GROUND_PLACEHOLDER}" data-ground="1"/>`);
  if (!organic) {
    const bands = {
      rock: [
        [3, 6, L.crevice, 1],
        [-0.75, 1.5, L.rim, 0.9],
      ],
      basalt: [
        [3, 6, L.crevice, 1],
        [3, 1.5, L.ember, 0.7],
        [-1.25, 2.5, L.rim, 0.9],
      ],
      forest: [
        [3, 6, L.shadow, 0.9],
        [-5, 10, L.shadow, 0.3],
      ],
    }[kind];
    for (const [offset, width, col, a] of bands) {
      const q = p.map((pt, i) => {
        const prev = p[(i + p.length - 1) % p.length];
        const next = p[(i + 1) % p.length];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: pt.x + (dy / len) * s * offset, y: pt.y + (-dx / len) * s * offset };
      });
      out.push(
        `<polygon points="${pts(q)}" fill="none" stroke="${col}" stroke-opacity="${a}" stroke-width="${width}" stroke-linejoin="round"/>`,
      );
    }
    return;
  }
  // Organic: a broken rim. A crevice line, chunks tumbling out over it, a lit rim that breaks.
  out.push(
    `<polygon points="${pts(p)}" fill="none" stroke="${L.crevice}" stroke-width="8" stroke-linejoin="round"/>`,
  );
  if (kind === "basalt")
    out.push(
      `<polygon points="${pts(p)}" fill="none" stroke="${L.ember}" stroke-opacity="0.6" stroke-width="1.5" stroke-linejoin="round" stroke-dasharray="26 40"/>`,
    );
  for (const q of along(p, 17)) {
    const d = 2 + r() * (kind === "forest" ? 16 : 11);
    const cx = q.x + q.dy * s * d;
    const cy = q.y + -q.dx * s * d;
    const size = kind === "forest" ? 6 + r() * 11 : 3 + r() * 8;
    const n = 5 + Math.floor(r() * 2);
    const ang = r() * 6;
    const shape = Array.from(
      { length: n },
      (_, i) =>
        `${f(cx + Math.cos(ang + (i / n) * 6.283) * size * (0.7 + r() * 0.5))},${f(cy + Math.sin(ang + (i / n) * 6.283) * size * (0.6 + r() * 0.4))}`,
    ).join(" ");
    if (kind === "forest") {
      out.push(
        `<polygon points="${shape}" fill="${r() < 0.5 ? L.chunk : L.rim}" stroke="${OUTLINE}" stroke-width="1"/>`,
      );
    } else {
      out.push(
        `<polygon points="${shape}" fill="${L.chunk}" stroke="${OUTLINE}" stroke-width="1"/>`,
      );
      out.push(
        `<polyline points="${shape.split(" ").slice(0, 3).join(" ")}" fill="none" stroke="${L.rim}" stroke-opacity="0.7" stroke-width="0.9"/>`,
      );
    }
  }
  // the lit rim breaks: dashes instead of a line
  out.push(
    `<polygon points="${pts(p)}" fill="none" stroke="${L.rim}" stroke-opacity="0.85" stroke-width="1.6" stroke-linejoin="round" stroke-dasharray="${kind === "forest" ? "6 16" : "34 9 12 7"}"/>`,
  );
}
const GROUND_PLACEHOLDER = "__GROUND__";

// ---------------------------------------------------------------------------
// One world: a map drawn authored or organic, to a group in <defs>.

function world(map, organic, treat) {
  const defs = [];
  const out = [];
  const floor = FLOOR[map.m.biome];
  const view = [-300, -300, map.m.width + 600, map.m.height + 600];
  const edgeEl = map.els.find((e) => e.type === "edge");
  const kind = map.m.bounds.outside;
  const seed = hashString(map.id);
  const pick = (e) => (organic ? e.org : e.auth);
  const body = [];
  paintEdge(out, defs, kind, pick(edgeEl), organic, seed, view);
  // the ground: a floor with grain
  const gid = `g${defId++}`;
  defs.push(
    `<pattern id="${gid}" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="${floor}"/>${Array.from(
      { length: 22 },
      (_, i) => {
        const r = rng(i * 77 + 3);
        return `<circle cx="${f(r() * 64)}" cy="${f(r() * 64)}" r="${f(2 + r() * 5)}" fill="${i % 2 ? "#ffffff" : "#000000"}" fill-opacity="0.045"/>`;
      },
    ).join("")}</pattern>`,
  );
  const joined = out.join("").replace(GROUND_PLACEHOLDER, `url(#${gid})`);
  const outBody = [joined];
  const pave = map.els.filter((e) => e.type === "paving");
  pave.forEach((e, i) => paintPaving(outBody, pick(e), organic, seed + i));
  for (const e of map.els.filter(
    (x) => x.type === "zone" && (x.zone === "mire" || x.zone === "spring"),
  ))
    paintZone(outBody, defs, e, pick(e), organic ? treat : "A", hashString(e.id));
  for (const e of map.els.filter((x) => x.type === "water"))
    paintWater(outBody, defs, e, pick(e), hashString(e.id));
  for (const e of map.els.filter(
    (x) => x.type === "zone" && x.zone !== "mire" && x.zone !== "spring",
  ))
    paintZone(outBody, defs, e, pick(e), organic ? treat : "A", hashString(e.id));
  void body;
  return { defs: defs.join(""), svg: outBody.join("") };
}

// ---------------------------------------------------------------------------
// The sheet.

const W = 1500;
const C = { bg: "#0e1116", panel: "#141a22", ink: "#d7dee8", dim: "#7d8899" };
const parts = [];
const defsAll = [];
const text = (x, y, s, size = 12, fill = C.ink, extra = "") =>
  parts.push(
    `<text x="${x}" y="${y}" font-family="DejaVu Sans, sans-serif" font-size="${size}" fill="${fill}" ${extra}>${s}</text>`,
  );

/** Register a world once; returns its def id. */
const worlds = new Map();
function use(map, organic, treat) {
  const key = `${map.id}-${organic ? "o" + treat : "a"}`;
  if (!worlds.has(key)) {
    const w = world(map, organic, treat);
    defsAll.push(w.defs, `<g id="w-${key}">${w.svg}</g>`);
    worlds.set(key, true);
  }
  return `w-${key}`;
}
/** A crop of a world: viewBox [x, y, w, h] in world units, shown at `scale` px per unit. */
function crop(px, py, id, vb, scale, label, grey = false) {
  const [vx, vy, vw, vh] = vb;
  const w = vw * scale;
  const h = vh * scale;
  const k = `k${defId++}`;
  defsAll.push(
    `<clipPath id="${k}"><rect x="${px}" y="${py}" width="${f(w)}" height="${f(h)}"/></clipPath>`,
  );
  parts.push(
    `<g clip-path="url(#${k})"${grey ? ' filter="url(#grey)"' : ""}><use xlink:href="#${id}" transform="translate(${px} ${py}) scale(${scale}) translate(${-vx} ${-vy})"/></g>`,
  );
  parts.push(
    `<rect x="${px}" y="${py}" width="${f(w)}" height="${f(h)}" fill="none" stroke="#2a3340"/>`,
  );
  if (label) text(px + 4, py + h + 13, label, 10, C.dim);
  return { w, h };
}
defsAll.push(`<filter id="grey"><feColorMatrix type="saturate" values="0"/></filter>`);

let y = 20;
text(20, y + 8, "VibeWars organic-edges study (#4251)", 20);
text(
  20,
  y + 28,
  "Real maps, authored (left) beside roughened (right). Look: the game's WATER_LOOK, ZONE_LOOK and OUTSIDE_EDGE, tones graded dark. Gameplay shapes follow the organic outline (Q212).",
  11,
  C.dim,
);
y += 48;

const centroid = (p) => ({
  x: p.reduce((s, q) => s + q.x, 0) / p.length,
  y: p.reduce((s, q) => s + q.y, 0) / p.length,
});
const bbox = (p) => ({
  x0: Math.min(...p.map((q) => q.x)),
  x1: Math.max(...p.map((q) => q.x)),
  y0: Math.min(...p.map((q) => q.y)),
  y1: Math.max(...p.map((q) => q.y)),
});
const el = (map, id) => map.els.find((e) => e.id === id);
/** A point a fraction `t` round an element's authored perimeter. */
const onRim = (map, id, t) => {
  const q = along(el(map, id).auth, 4);
  return q[Math.floor(q.length * t) % q.length];
};

// Per map: an overview pair, then crops pairs at zoom 1 and 2.
const SPECS = [
  {
    map: MAPS[0],
    title: "Blackwater Ford (marsh, rock edge): deep and shallow water, mire, paving",
    crops: [
      {
        what: "Deep and shallow water, north ford",
        centre: onRim(MAPS[0], "north-ford", 0.22),
        zoom: 1,
      },
      { what: "Mill race and reed mire", centre: onRim(MAPS[0], "mill-race", 0.35), zoom: 2 },
      { what: "The map edge, west", centre: { x: 330, y: 900 }, zoom: 1 },
    ],
  },
  {
    map: MAPS[1],
    title: "Ember Pits (volcanic, basalt edge): molten, scorched, vents",
    crops: [
      { what: "Molten and scorched ground", centre: onRim(MAPS[1], "cinder-rill", 0.3), zoom: 1 },
      { what: "A vent and its crust", centre: onRim(MAPS[1], "south-vent", 0.1), zoom: 2 },
      { what: "The map edge, north", centre: { x: 1500, y: 150 }, zoom: 1 },
    ],
  },
  {
    map: MAPS[2],
    title: "Moss Vale (wilds, forest edge): pool, race and rills, bogs, springs",
    crops: [
      {
        what: "The falls pool, deep and shallow",
        centre: onRim(MAPS[2], "falls-pool", 0.9),
        zoom: 1,
      },
      { what: "A bog and a spring", centre: onRim(MAPS[2], "bog-west", 0.4), zoom: 2 },
      { what: "The map edge, forest", centre: { x: 400, y: 600 }, zoom: 1 },
    ],
  },
];

for (const spec of SPECS) {
  const map = spec.map;
  text(20, y + 10, spec.title, 14);
  y += 22;
  const a = use(map, false, "A");
  const o = use(map, true, "B");
  // overview
  const s = 0.13;
  const ov = [0, 0, map.m.width, map.m.height];
  const r1 = crop(20, y, a, ov, s, "authored");
  crop(40 + r1.w, y, o, ov, s, "organic (edge B)");
  y += r1.h + 24;
  for (const c of spec.crops) {
    const vw = c.zoom === 1 ? 640 : 320;
    const vh = c.zoom === 1 ? 300 : 150;
    const vb = [Math.round(c.centre.x - vw / 2), Math.round(c.centre.y - vh / 2), vw, vh];
    const left = crop(20, y, a, vb, c.zoom === 1 ? 1 : 2, `${c.what}: authored, zoom ${c.zoom}`);
    crop(40 + left.w, y, o, vb, c.zoom === 1 ? 1 : 2, `organic, zoom ${c.zoom}`);
    y += left.h + 26;
  }
  y += 10;
}

// Edge treatments on one zone kind per map, zoom 2.
text(
  20,
  y + 10,
  "Zone edge treatments (zoom 2): A hard edge only, B hard edge + feather outside, C hard edge + ragged inner crust",
  14,
);
y += 24;
const TREAT = [
  { map: MAPS[1], id: "cinder-rill", label: "molten" },
  { map: MAPS[1], id: "south-crust", label: "scorched" },
  { map: MAPS[2], id: "bog-west", label: "mire" },
  { map: MAPS[2], id: "spring-west", label: "spring" },
];
let x = 20;
for (const t of TREAT) {
  const e = el(t.map, t.id);
  const bb = bbox(e.org);
  const cx = (bb.x0 + bb.x1) / 2;
  const cy = (bb.y0 + bb.y1) / 2;
  for (const tr of ["A", "B", "C"]) {
    const wid = use(t.map, true, tr);
    const vb = [Math.round(cx - 75), Math.round(cy - 55), 150, 110];
    crop(x, y, wid, vb, 1.55, `${t.label}, ${tr}`);
    x += 240;
    if (x + 232 > W) {
      x = 20;
      y += 190;
    }
  }
}
y += 200;

// Colour-blind pass: the same frame in grey.
text(
  20,
  y + 10,
  "Grey pass (zoom 1): the hard edge and the zone still part from the floor without hue",
  14,
);
y += 22;
{
  const c = centroid(el(MAPS[1], "cinder-rill").auth);
  const vb = [Math.round(c.x - 320), Math.round(c.y - 150), 640, 300];
  const g1 = crop(20, y, use(MAPS[1], false, "A"), vb, 1, "authored, grey", true);
  crop(40 + g1.w, y, use(MAPS[1], true, "B"), vb, 1, "organic B, grey", true);
  y += g1.h + 30;
}

// ---------------------------------------------------------------------------
// Numbers.

const count = (els, type, field) =>
  els.filter((e) => e.type === type).reduce((s, e) => s + e[field].length, 0);
const rows = MAPS.map((m) => {
  const harmful = m.els.filter((e) => e.type === "zone" && !["mire", "spring"].includes(e.zone));
  const hmax = Math.max(0, ...m.els.filter((e) => e.type === "water").map((e) => e.org.length));
  return {
    id: m.id,
    water: [count(m.els, "water", "auth"), count(m.els, "water", "org"), hmax],
    zones: [count(m.els, "zone", "auth"), count(m.els, "zone", "org")],
    harmful: [
      harmful.reduce((s, e) => s + e.auth.length, 0),
      harmful.reduce((s, e) => s + e.org.length, 0),
    ],
    edge: [
      m.els.find((e) => e.type === "edge").auth.length,
      m.els.find((e) => e.type === "edge").org.length,
    ],
    paving: [count(m.els, "paving", "auth"), count(m.els, "paving", "org")],
    fell: m.els.filter((e) => e.used.A === 0).map((e) => e.id),
    halved: m.els.filter((e) => e.used.tries > 0 && e.used.A > 0).map((e) => e.id),
    perBody: Math.max(0, ...m.els.filter((e) => e.type === "water").map((e) => e.org.length)),
    perPaving: Math.max(0, ...m.els.filter((e) => e.type === "paving").map((e) => e.org.length)),
    maxZone: Math.max(0, ...m.els.filter((e) => e.type === "zone").map((e) => e.org.length)),
  };
});

const H = y + 10;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defsAll.join("")}</defs><rect width="${W}" height="${H}" fill="${C.bg}"/>${parts.join("")}</svg>`;
const svgFile = join(tmpdir(), "organic-edges-study.svg"); // 4 MB: only the png is kept
writeFileSync(svgFile, svg);
execFileSync(
  "inkscape",
  [svgFile, "--export-type=png", `--export-filename=${base}.png`, "--export-background-opacity=1"],
  { stdio: "ignore" },
);
execFileSync("magick", [`${base}.png`, "-colors", "192", `${base}.png`]);

const md = [];
md.push(
  "# Organic edges study (#4251)",
  "",
  "Design only. `scripts/assets/organic-edges-study.mjs` reads the real maps (`blackwater-ford`, `ember-pits`, `moss-vale`) and draws `organic-edges-study.png`; this page is written by the same run. Gameplay shapes follow the organic outline (operator Q212): collision, slowdown, zone damage and bot navigation use the polygon the renderer draws. Point-symmetric maps are **not** mirrored: each element has its own seed.",
  "",
  "## The roughening (one algorithm for the sim and the renderer)",
  "",
  "Input: a closed polygon (a rect is its four corners), the map id, the element id and its kind. Output: a closed polygon. Deterministic, integer coordinates, no `Math.random`.",
  "",
  "1. **Subdivide.** Cut every edge into `ceil(length / L)` equal segments. Original corners stay as points.",
  "2. **Displace.** Move every point along its normal (the perpendicular of its two neighbours' chord) by `A * field(x, y)`, with `field` in [-1, 1]: 2D value noise, three octaves, weights 0.57 / 0.29 / 0.14 (§4), wavelengths `F`, `F/2`, `F/4`. A lattice value is the FNV-1a hash of the seed and the cell. The first octave is seeded by `mapId:kind`, so a shallow inside its deep water drifts with it; the two finer ones by `mapId:elementId`.",
  "3. **Keep out.** The displacement is multiplied by `clamp((d - 60) / 60, 0, 1)`, `d` the distance to the nearest spawn or objective: nothing moves within 60 units, full strength by 120.",
  "4. **Pin and validate.** A point on another element's authored edge (a waterfall's foot on its pool) does not move. The result must be a simple polygon, must cross no other element of the same kind and layer that the authored shape did not cross, and a shallow that lay inside a deep water stays inside its roughened outline. If not, halve `A` and retry, up to three times; then the element stays as authored (reported below).",
  "",
  "| Element | L (u) | A (u) | F (u) | Notes |",
  "| ------- | ----- | ----- | ----- | ----- |",
  `| Deep water | ${KINDS.water.L} | ${KINDS.water.A} | ${KINDS.water.F} | coves and points |`,
  `| Shallow water | ${KINDS.water.L} | ${KINDS.water.shallowA} | ${KINDS.water.F} | shares the deep water's coarse octave and must stay inside it |`,
  `| Zone | ${KINDS.zone.L} | ${KINDS.zone.A} | ${KINDS.zone.F} | hard edge follows the shape |`,
  `| Map edge | ${KINDS.edge.L} | ${KINDS.edge.A} | ${KINDS.edge.F} | rim chunks are render-only, not shapes |`,
  `| Paving | ${KINDS.paving.L} | ${KINDS.paving.A} | ${KINDS.paving.F} | stones over the ragged edge are render-only |`,
  "",
  "Render-only parts (rim chunks, paving stones, the feather) are drawn from the same seed and never move a hit shape.",
  "",
  "## Point budget",
  "",
  "Points per map, authored → organic (all elements of the kind):",
  "",
  "| Map | Water | Harmful zones | All zones | Map edge | Paving | Largest water body |",
  "| --- | ----- | ------------- | --------- | -------- | ------ | ------------------ |",
);
for (const r of rows)
  md.push(
    `| ${r.id} | ${r.water[0]} → ${r.water[1]} | ${r.harmful[0]} → ${r.harmful[1]} | ${r.zones[0]} → ${r.zones[1]} | ${r.edge[0]} → ${r.edge[1]} | ${r.paving[0]} → ${r.paving[1]} | ${r.perBody} |`,
  );
const maxWater = Math.max(...rows.map((r) => r.perBody));
const maxHarm = Math.max(...rows.map((r) => r.harmful[1]));
md.push(
  "",
  `- **Water.** The schema allows 64 points a body. At these settings the largest body needs ${maxWater}, so the cap goes to **${Math.ceil((maxWater * 1.5) / 16) * 16}** (50 % headroom for longer shores).`,
  `- **Harmful zones.** \`MAX_HARMFUL_ZONE_POINTS\` is 64 in total because their corners feed the bots' visibility graph (\`pathing.ts:484\`). Ember Pits' harmful zones go ${rows[1].harmful[0]} → ${rows[1].harmful[1]}. A total cap of **${Math.ceil((maxHarm * 1.5) / 32) * 32}** covers it. A visibility graph built on every roughened corner grows quadratically: the architect should decide between raising the cap as is and building the graph from a simplified copy of the polygon (Douglas-Peucker, 12 u tolerance) while collision and damage use the full one. The study shows the full shape only.`,
  "- **Map edge and paving.** Not capped by the schema today; the outline goes to the point counts above.",
  "",
  "### What the algorithm could not do",
  "",
);
for (const r of rows) {
  md.push(
    `- ${r.id}: ${r.fell.length ? `stayed authored: ${r.fell.join(", ")}` : "every element roughened"}${r.halved.length ? `; amplitude halved or more: ${r.halved.join(", ")}` : ""}.`,
  );
}
md.push(
  "",
  "## Edge treatments",
  "",
  "Every treatment keeps §4: the 2 px edge is hard and never softer than its fill.",
  "",
  "- **A, hard edge only.** The honest shape, nothing else. Harsh next to the floor: the whole zone reads as a cut-out.",
  "- **B, hard edge plus a feather outside.** A blurred ring of the zone's own fill, outside the edge: 9 u at 40 % for harmful zones, 22 u at 30 % for mire and springs. The floor appears to take the colour; the edge itself stays crisp. **Proposed.**",
  "- **C, hard edge plus an inner crust.** A ragged dashed line 4 to 10 u inside the edge. Reads as cracked ground. Busy at zoom 1; fine for scorched ground, noisy on liquids.",
  "",
  "Readability (§6): a harmful zone's feather is warm like the zone and thin, so a player still judges where it hurts by the hard edge. The feather is drawn under bodies and projectiles, as the fill is. In the grey pass the edge and the fill still part from the floor.",
  "",
  "## What changes where",
  "",
  "- **Water.** `water-shape.ts` `waterShapeOf`: the outline is the roughened polygon (the map data carries it; see the follow-up). The deep water's lip and the shallow's shore line follow it.",
  "- **Zones.** `zone-painter.ts` `drawnOutline` draws the polygon as given; the feather is one extra blurred stroke under it.",
  "- **Map edge.** `outside-land.ts` `paintOutsideEdge`: replace the offset bands with the crevice line, the broken rim and tumbled chunks, seeded from the map id.",
  "- **Paving.** `paving-painter.ts`: the same, a bed on the ragged polygon and stones over its edge.",
  "",
  "## Cost",
  "",
  "Roughening runs once at map load (a few thousand noise samples: well under a millisecond). Drawing is polygon fills, as today, with up to 4 times the points; the rim chunks are static. They are baked with the outside's sprite (a map's outside already costs a sprite, `outside-land.ts`), so the frame cost is unchanged. The feather is one blurred stroke per zone, baked in the zone's own texture.",
  "",
);
writeFileSync(`${base}.md`, md.join("\n"));
console.log(JSON.stringify(rows));
