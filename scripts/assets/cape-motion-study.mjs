// Draws a study of a MOVING guild cape on the top-down body (#1686, #481). It is
// a design reference for the operator's pick, not a game asset. Study, not decided.
//
//   node scripts/assets/cape-motion-study.mjs            writes docs/art/cape-motion-study.svg
//   node scripts/assets/cape-motion-study.mjs --frame 3  writes /tmp/cape-motion-frame.svg: the
//                                                         sheet frozen at t = 3 s (for review)
//
// The cape is almost invisible (a thin border on the rim) when the body stands
// still, unfolds when it walks, trails opposite its MOVEMENT (not its facing)
// and lags a turn. The physics is stepped here, in JS, and written as SMIL
// keyframes (<animate>, no script: GitHub strips scripts), so the sheet plays
// when opened in a browser or on GitHub. The game would step the same springs
// per body from snapshot velocity, client-side.
//
// Three variants, each playing the same clip on an arena-scale body with sword
// and shield marks (the marks the cape must not hide):
//   A: a rim band that peels off into a trailing tab.
//   B: one cloth panel on a two-segment spring chain.
//   C: a pair of streamers, three-segment chains.
// And a second clip per variant: two bodies walking past each other.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { WEAPON_MARK_GEOMETRY } from "../../apps/web/src/render/weapon-mark-geometry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const frameArg = process.argv.indexOf("--frame");
const frameAt = frameArg === -1 ? undefined : Number(process.argv[frameArg + 1]);
const outFile =
  frameAt === undefined
    ? join(root, "docs", "art", "cape-motion-study.svg")
    : "/tmp/cape-motion-frame.svg";

/** The palette. Mirrors docs/art/art-direction.md. */
const C = {
  bg: "#0e1116",
  panel: "#161b22",
  line: "#2b3440",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  friend: "#59c2ff",
  foe: "#ff7b72",
  edge: "#0b0f14",
  gold: "#e6c04a",
  black: "#23272e",
};

/** The cape of the study: gold with black trim and a chevron, as in cape-study.svg. */
const CAPE = { main: C.gold, trim: C.black };

/** Body radius in world units; also the collision radius. */
const R = 14;
/** A body's run speed in world units per second, for the clips. */
const RUN = 40;
/** Pixels per world unit in the panels. */
const S = 1.8;

/** @param {number} n */
const f = (n) => String(Math.round(n * 10) / 10);
const deg = (/** @type {number} */ d) => (d * Math.PI) / 180;
/** @param {number} x */
const smooth = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
/** @param {[number, number][]} p */
const pts = (p) => p.map(([px, py]) => `${f(px)},${f(py)}`).join(" ");
/** @param {number} x @param {number} y @param {number} a @param {number} d @returns {[number, number]} */
const polar = (x, y, a, d) => [x + Math.cos(a) * d, y + Math.sin(a) * d];

// ---------------------------------------------------------------------------
// The clips: what each body does, as intents. The body's velocity and facing
// follow them with a short lag, so starts, stops and turns are not instant.

/** @typedef {{ to: number, heading?: number, face: number }} Intent heading in degrees; absent = standing */

/** Solo clip, seconds. 1 still, 2 walk right, 3 turn and walk up, 4 stop, 5 a step, 6 strafe. */
const SOLO = /** @type {const} */ ({
  length: 9,
  start: [-40, 34],
  intents: /** @type {Intent[]} */ ([
    { to: 1, face: 0 },
    { to: 2.5, heading: 0, face: 0 },
    { to: 3.2, heading: -90, face: -90 },
    { to: 4.2, heading: -90, face: -90 },
    { to: 5.4, face: -90 },
    { to: 5.6, heading: 0, face: 0 },
    { to: 6.8, face: 0 },
    { to: 8, heading: 90, face: 0 },
    { to: 9, face: 0 },
  ]),
  captions: /** @type {[string, number, number][]} */ ([
    ["1  standing: folded, a thin border", 0, 1],
    ["2  walk right: unfolds, trails left", 1, 2.5],
    ["3  turn, walk up: swings round, lags", 2.5, 4.2],
    ["4  stop: settles, folds back", 4.2, 5.4],
    ["5  one step: no full unfold", 5.4, 6.8],
    ["6  strafe: faces right, moves down", 6.8, 8],
    ["folds back", 8, 9],
  ]),
});

/** Pass clip, seconds: two bodies walking past each other in lanes 34 apart. */
const PASS = { length: 5, lane: 17, from: 100 };

/**
 * One body's samples every 1/60 s: position, velocity, facing (continuous angle, degrees).
 * @param {[number, number]} start @param {Intent[]} intents @param {number} length
 */
function simulateBody(start, intents, length) {
  const dt = 1 / 60;
  let [x, y] = start;
  let vx = 0;
  let vy = 0;
  let face = intents[0]?.face ?? 0;
  /** @type {{ x: number, y: number, vx: number, vy: number, face: number }[]} */
  const out = [];
  for (let i = 0; i <= Math.round(length / dt); i++) {
    const t = i * dt;
    const it = intents.find((n) => t < n.to) ?? intents[intents.length - 1];
    if (it === undefined) break;
    const tv = it.heading === undefined ? 0 : RUN;
    const h = deg(it.heading ?? 0);
    // Heading turns with the facing inside a turn: blend by how far through the intent we are.
    vx += (Math.cos(h) * tv - vx) * (1 - Math.exp(-dt / 0.09));
    vy += (Math.sin(h) * tv - vy) * (1 - Math.exp(-dt / 0.09));
    face += (it.face - face) * (1 - Math.exp(-dt / 0.12));
    x += vx * dt;
    y += vy * dt;
    out.push({ x, y, vx, vy, face });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The cape physics. Per body: a smoothed trail direction (opposite the
// movement), an unfold amount `u` (0 folded, 1 full, itself lagged so a single
// step cannot unfold it), and a chain of nodes that follow targets on the
// trail line with a damped spring each. Nodes are in world space, so the
// cloth lags the body naturally; later nodes are softer and lag more.

/** @typedef {{ x: number, y: number, vx: number, vy: number }} Node */

/**
 * @param {number} nodes
 * @param {number} flap how much the free end flutters (units)
 * @param {number} spread streamer spread (radians), 0 for a single chain
 */
function makeCape(nodes, flap, spread) {
  return {
    nodes: /** @type {Node[]} */ (
      Array.from({ length: nodes }, () => ({ x: 0, y: 0, vx: 0, vy: 0 }))
    ),
    td: /** @type {[number, number]} */ ([-1, 0]),
    u: 0,
    flap,
    spread,
    primed: false,
  };
}

/** @typedef {ReturnType<typeof makeCape>} CapeState */

/**
 * Where a node wants to be: on the trail line, `len` past the rim, `side` of the line.
 * @param {CapeState} c @param {number} px @param {number} py
 * @param {number} i @param {number} len @param {number} side @param {number} t
 */
function target(c, px, py, i, len, side, t) {
  const a = Math.atan2(c.td[1], c.td[0]) + side * c.spread * (1 - 0.55 * c.u);
  const [bx, by] = polar(px, py, a, R - 1 + len * c.u);
  // A flutter across the trail, only while it is unfolded.
  const w = Math.sin(t * 2 * Math.PI * 2.3 + i * 1.7 + side * 2) * c.flap * c.u * (i / 2);
  const [fx, fy] = polar(bx, by, a + Math.PI / 2, w);
  return [fx, fy];
}

/**
 * Step one cape by dt.
 * @param {CapeState} c @param {number} t @param {number} dt
 * @param {{ x: number, y: number, vx: number, vy: number, face: number }} b
 * @param {number[]} lens cumulative length of each node past the rim at full unfold
 * @param {number} side
 */
function stepCape(c, t, dt, b, lens, side) {
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > 3) {
    const k = 1 - Math.exp(-dt / 0.06);
    c.td[0] += (-b.vx / speed - c.td[0]) * k;
    c.td[1] += (-b.vy / speed - c.td[1]) * k;
    const m = Math.hypot(c.td[0], c.td[1]) || 1;
    c.td[0] /= m;
    c.td[1] /= m;
  }
  const want = smooth((speed - 4) / (RUN * 0.75 - 4));
  c.u += (want - c.u) * (1 - Math.exp(-dt / 0.2));
  c.nodes.forEach((n, i) => {
    const [tx, ty] = target(c, b.x, b.y, i, lens[i] ?? 0, side, t);
    if (!c.primed) {
      n.x = tx;
      n.y = ty;
      return;
    }
    // Softer and slacker towards the free end.
    const k = 260 / (1 + i * 1.6);
    const damp = 2 * Math.sqrt(k) * 0.55;
    n.vx += (k * (tx - n.x) - damp * n.vx) * dt;
    n.vy += (k * (ty - n.y) - damp * n.vy) * dt;
    n.x += n.vx * dt;
    n.y += n.vy * dt;
  });
  c.primed = true;
}

// ---------------------------------------------------------------------------
// Shapes, relative to the body's centre. Each returns the cloth polygon, the
// trim polyline and where the emblem sits, always with the same point counts
// so SMIL can animate them. Everything hides under the disc when folded; what
// stays is the thin border arc.

/** @typedef {{ cloth: [number, number][][], trim: [number, number][][], border: { a: number, span: number }, emblem?: { x: number, y: number, a: number } }} Shape */

/** The unit vector from the body to a node, falling back to the trail line. */
/** @param {CapeState} c @param {Node} n @param {{ x: number, y: number }} b @returns {[number, number]} */
function dirTo(c, n, b) {
  const dx = n.x - b.x;
  const dy = n.y - b.y;
  const m = Math.hypot(dx, dy);
  return m < 1e-3 ? [c.td[0], c.td[1]] : [dx / m, dy / m];
}

/** @param {[number, number]} from @param {[number, number]} to @returns {[number, number]} */
const unit = (from, to) => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const m = Math.hypot(dx, dy) || 1;
  return [dx / m, dy / m];
};

/**
 * A strip along a chain of points: `half[i]` either side of each, as a closed polygon.
 * @param {[number, number][]} p @param {number[]} half @returns {[number, number][]}
 */
function strip(p, half) {
  /** @type {[number, number][]} */
  const left = [];
  /** @type {[number, number][]} */
  const right = [];
  p.forEach((q, i) => {
    const a = p[Math.max(0, i - 1)] ?? q;
    const b = p[Math.min(p.length - 1, i + 1)] ?? q;
    const [tx, ty] = unit(a, b);
    const h = half[i] ?? 0;
    left.push([q[0] - ty * h, q[1] + tx * h]);
    right.push([q[0] + ty * h, q[1] - tx * h]);
  });
  return [...left, ...right.reverse()];
}

/**
 * A: a band on the rim that peels off into a tab. The band narrows as the tab grows.
 * @param {CapeState} c @param {{ x: number, y: number, face: number }} b @returns {Shape}
 */
function shapeA(c, b) {
  const n = /** @type {Node} */ (c.nodes[0]);
  const r = { x: n.x - b.x, y: n.y - b.y };
  const [dx, dy] = dirTo(c, n, b);
  const a = Math.atan2(dy, dx);
  const len = Math.max(R - 1, Math.hypot(r.x, r.y));
  /** @type {[number, number]} */
  const tip = [dx * len, dy * len];
  /** @type {[number, number]} */
  const root = [dx * (R - 3), dy * (R - 3)];
  const w = 3 + 4.5 * c.u;
  const hw = 3 + 5 * c.u;
  const notchAt = len - 4.5 * c.u;
  const left = unit([0, 0], [dy, -dx]);
  /** @type {[number, number][]} */
  const cloth = [
    [root[0] - left[0] * hw * 1.4, root[1] - left[1] * hw * 1.4],
    [tip[0] - left[0] * w, tip[1] - left[1] * w],
    [dx * notchAt, dy * notchAt],
    [tip[0] + left[0] * w, tip[1] + left[1] * w],
    [root[0] + left[0] * hw * 1.4, root[1] + left[1] * hw * 1.4],
  ];
  return {
    cloth: [cloth],
    trim: [
      [
        [cloth[1]?.[0] ?? 0, cloth[1]?.[1] ?? 0],
        [cloth[2]?.[0] ?? 0, cloth[2]?.[1] ?? 0],
        [cloth[3]?.[0] ?? 0, cloth[3]?.[1] ?? 0],
      ],
    ],
    // The band narrows from a wide rim arc to nothing under the tab.
    border: { a, span: deg(52 - 22 * c.u) },
    emblem: { x: dx * (R + 4 * c.u), y: dy * (R + 4 * c.u), a: a + Math.PI / 2 },
  };
}

/**
 * B: one panel on a two segment chain. The root sits under the disc, the middle and hem follow the chain.
 * @param {CapeState} c @param {{ x: number, y: number, face: number }} b @returns {Shape}
 */
function shapeB(c, b) {
  const n1 = /** @type {Node} */ (c.nodes[0]);
  const n2 = /** @type {Node} */ (c.nodes[1]);
  const [d1x, d1y] = dirTo(c, n1, b);
  /** @type {[number, number][]} */
  const chain = [
    [d1x * (R - 2), d1y * (R - 2)],
    [n1.x - b.x, n1.y - b.y],
    [n2.x - b.x, n2.y - b.y],
  ];
  const full = strip(chain, [6.5, 5.5 * (0.5 + 0.5 * c.u), 4.5 * (0.4 + 0.6 * c.u)]);
  // strip returns left0,left1,left2,right2,right1,right0: the hem is points 2 and 3, the notch sits between.
  const l2 = /** @type {[number, number]} */ (full[2]);
  const r2 = /** @type {[number, number]} */ (full[3]);
  const [hx, hy] = unit(
    /** @type {[number, number]} */ (chain[1]),
    /** @type {[number, number]} */ (chain[2]),
  );
  const notchBack = 4.5 * c.u;
  /** @type {[number, number]} */
  const notch = [(l2[0] + r2[0]) / 2 - hx * notchBack, (l2[1] + r2[1]) / 2 - hy * notchBack];
  /** @type {[number, number][]} */
  const cloth = [
    /** @type {[number, number]} */ (full[0]),
    /** @type {[number, number]} */ (full[1]),
    l2,
    notch,
    r2,
    /** @type {[number, number]} */ (full[4]),
    /** @type {[number, number]} */ (full[5]),
  ];
  const a1 = Math.atan2(d1y, d1x);
  return {
    cloth: [cloth],
    trim: [[l2, notch, r2]],
    border: { a: a1, span: deg(48) },
    emblem: { x: chain[1]?.[0] ?? 0, y: chain[1]?.[1] ?? 0, a: Math.atan2(hy, hx) - Math.PI / 2 },
  };
}

/**
 * C: two streamers, each a ribbon on a three node chain.
 * @param {CapeState[]} cs @param {{ x: number, y: number, face: number }} b @returns {Shape}
 */
function shapeC(cs, b) {
  const c = /** @type {CapeState} */ (cs[0]);
  /** @type {[number, number][][]} */
  const cloth = [];
  /** @type {[number, number][][]} */
  const trim = [];
  for (const own of cs) {
    const n0 = /** @type {Node} */ (own.nodes[0]);
    const [dx, dy] = dirTo(own, n0, b);
    /** @type {[number, number][]} */
    const chain = [
      [dx * (R - 2), dy * (R - 2)],
      ...own.nodes.map((n) => /** @type {[number, number]} */ ([n.x - b.x, n.y - b.y])),
    ];
    const poly = strip(chain, [2.2, 2.2, 1.8, 1.4]);
    cloth.push(poly);
    trim.push([poly[3] ?? [0, 0], poly[4] ?? [0, 0]]);
  }
  return { cloth, trim, border: { a: Math.atan2(c.td[1], c.td[0]), span: deg(55) } };
}

/** @typedef {{ name: string, nodes: number, flap: number, spread: number, lens: number[], shape: (c: CapeState, b: { x: number, y: number, face: number }) => Shape, sides: number }} Variant */
/** @type {Record<"A" | "B" | "C", Variant>} */
const VARIANTS = {
  A: {
    name: "A  Rim band that peels into a tab",
    nodes: 1,
    flap: 1.4,
    spread: 0,
    lens: [17],
    shape: shapeA,
    sides: 1,
  },
  B: {
    name: "B  One cloth panel, two-segment chain",
    nodes: 2,
    flap: 2.2,
    spread: 0,
    lens: [8, 17],
    shape: shapeB,
    sides: 1,
  },
  C: {
    name: "C  A pair of streamers",
    nodes: 3,
    flap: 3,
    spread: deg(32),
    lens: [7, 13, 19],
    shape: shapeC,
    sides: 2,
  },
};

/**
 * Cape samples for one body: one shape per output frame.
 * @param {Variant} v @param {ReturnType<typeof simulateBody>} body @param {number} fps
 */
function simulateCape(v, body, fps) {
  const caps = Array.from({ length: v.sides }, () => makeCape(v.nodes, v.flap, v.spread));
  const every = Math.round(60 / fps);
  /** @type {Shape[]} */
  const shapes = [];
  body.forEach((b, i) => {
    const t = i / 60;
    caps.forEach((c, k) => {
      stepCape(c, t, 1 / 60, b, v.lens, v.sides === 2 ? (k === 0 ? -1 : 1) : 0);
    });
    if (i % every === 0)
      shapes.push(v.sides === 2 ? shapeC(caps, b) : v.shape(/** @type {CapeState} */ (caps[0]), b));
  });
  return shapes;
}

// ---------------------------------------------------------------------------
// Drawing.

const SHIELD_FROM = deg(45);
const SHIELD_TO = deg(105);
const SHIELD_AT = R + 3.5;

/** The shield arc on the off-hand side, facing right. */
function shield() {
  const [x1, y1] = polar(0, 0, -SHIELD_FROM, SHIELD_AT);
  const [x2, y2] = polar(0, 0, -SHIELD_TO, SHIELD_AT);
  const d = `M${f(x1)} ${f(y1)}A${f(SHIELD_AT)} ${f(SHIELD_AT)} 0 0 0 ${f(x2)} ${f(y2)}`;
  return (
    `<path d="${d}" fill="none" stroke="${C.edge}" stroke-width="5"/>` +
    `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="3"/>`
  );
}

/** The sword mark, facing right: 4 px `edge` casing under a 2 px `ink` core. */
function sword() {
  const g = WEAPON_MARK_GEOMETRY.sword;
  /** @param {readonly { x: number, y: number }[]} line @returns {[number, number][]} */
  const place = (line) => line.map((q) => [q.x, q.y]);
  let out = "";
  for (const [colour, w] of /** @type {const} */ ([
    [C.edge, 4],
    [C.ink, 2],
  ])) {
    const s = `stroke="${colour}" stroke-linecap="butt" stroke-linejoin="miter"`;
    for (const l of g.strokes)
      out += `<polyline points="${pts(place(l))}" fill="none" ${s} stroke-width="${String(w)}"/>`;
    for (const l of g.fills)
      out += `<polygon points="${pts(place(l))}" fill="${colour}" ${s} stroke-width="${String(w - 2)}"/>`;
  }
  return out;
}

/** The chevron emblem of cape-study.svg, 5 units across, pointing up. */
const CHEVRON = `<polygon points="-2.3,1.2 0,-1.5 2.3,1.2 2.3,2.3 0,-0.3 -2.3,2.3"/>`;

/** `<animate>` over a list of values, looping with the clip. @param {string} attr @param {string[]} values @param {number} dur */
const animate = (attr, values, dur) =>
  `<animate attributeName="${attr}" values="${values.join(";")}" dur="${f(dur)}s" repeatCount="indefinite"/>`;

/** @param {string} type @param {string[]} values @param {number} dur */
const animateT = (type, values, dur) =>
  `<animateTransform attributeName="transform" type="${type}" values="${values.join(";")}" dur="${f(dur)}s" repeatCount="indefinite" additive="sum"/>`;

/**
 * One animated body: its cape under the disc, the disc, the border, the marks.
 * With `at` set, the frame at that index, not animated.
 * @param {Shape[]} shapes @param {ReturnType<typeof simulateBody>} body @param {number} fps
 * @param {string} team @param {boolean} self @param {number} dur @param {number | undefined} at
 */
function animatedBody(shapes, body, fps, team, self, dur, at) {
  const every = Math.round(60 / fps);
  const frames = body.filter((_, i) => i % every === 0);
  const pick = at === undefined ? undefined : Math.min(frames.length - 1, Math.round(at * fps));
  const first = /** @type {Shape} */ (shapes[0]);
  const parts = first.cloth.length;
  /** @param {(s: Shape) => string} get */
  const seq = (get) => shapes.map(get);

  let cape = "";
  for (let k = 0; k < parts; k++) {
    const cloth = (/** @type {Shape} */ s) => pts(s.cloth[k] ?? []);
    const trim = (/** @type {Shape} */ s) => pts(s.trim[k] ?? []);
    cape +=
      pick === undefined
        ? `<polygon points="${cloth(first)}" fill="${CAPE.main}" stroke="${C.edge}" stroke-width="1.6" stroke-linejoin="round">${animate("points", seq(cloth), dur)}</polygon>` +
          `<polyline points="${trim(first)}" fill="none" stroke="${CAPE.trim}" stroke-width="1.4" stroke-linejoin="round">${animate("points", seq(trim), dur)}</polyline>`
        : `<polygon points="${cloth(/** @type {Shape} */ (shapes[pick]))}" fill="${CAPE.main}" stroke="${C.edge}" stroke-width="1.6" stroke-linejoin="round"/>` +
          `<polyline points="${trim(/** @type {Shape} */ (shapes[pick]))}" fill="none" stroke="${CAPE.trim}" stroke-width="1.4" stroke-linejoin="round"/>`;
  }
  const hasEmblem = first.emblem !== undefined;
  /** @param {Shape} s */
  const emblemT = (s) => `${f(s.emblem?.x ?? 0)} ${f(s.emblem?.y ?? 0)}`;
  /** @param {Shape} s */
  const emblemR = (s) => f(((s.emblem?.a ?? 0) * 180) / Math.PI);
  if (hasEmblem) {
    const g0 = /** @type {Shape} */ (shapes[pick ?? 0]);
    cape +=
      `<g fill="${CAPE.trim}" transform="translate(${emblemT(g0)}) rotate(${emblemR(g0)}) scale(1.1)">${CHEVRON}` +
      (pick === undefined ? "" : "") +
      `</g>`;
  }

  /** Border: a thin arc on the rim, behind. @param {Shape} s */
  const borderD = (s) => {
    const { a, span } = s.border;
    const [x1, y1] = polar(0, 0, a - span, R + 0.9);
    const [x2, y2] = polar(0, 0, a + span, R + 0.9);
    return `M${f(x1)} ${f(y1)}A${f(R + 0.9)} ${f(R + 0.9)} 0 0 1 ${f(x2)} ${f(y2)}`;
  };
  const border =
    pick === undefined
      ? `<path d="${borderD(first)}" fill="none" stroke="${C.edge}" stroke-width="3" stroke-linecap="round">${animate("d", seq(borderD), dur)}</path>` +
        `<path d="${borderD(first)}" fill="none" stroke="${CAPE.main}" stroke-width="1.5" stroke-linecap="round">${animate("d", seq(borderD), dur)}</path>`
      : `<path d="${borderD(/** @type {Shape} */ (shapes[pick]))}" fill="none" stroke="${C.edge}" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="${borderD(/** @type {Shape} */ (shapes[pick]))}" fill="none" stroke="${CAPE.main}" stroke-width="1.5" stroke-linecap="round"/>`;

  const at0 = /** @type {{ x: number, y: number, face: number }} */ (frames[pick ?? 0]);
  const move =
    pick === undefined
      ? `<g transform="translate(0 0)">${animateT(
          "translate",
          frames.map((b) => `${f(b.x)} ${f(b.y)}`),
          dur,
        )}`
      : `<g transform="translate(${f(at0.x)} ${f(at0.y)})">`;
  const turn =
    pick === undefined
      ? `<g transform="rotate(0)">${animateT(
          "rotate",
          frames.map((b) => f(b.face)),
          dur,
        )}`
      : `<g transform="rotate(${f(at0.face)})">`;

  return (
    move +
    cape +
    `<circle r="${String(R)}" fill="${team}"/>` +
    `<circle r="${f(R - 0.75)}" fill="none" stroke="${C.edge}" stroke-width="1.5"/>` +
    (self ? `<circle r="${String(R - 2)}" fill="none" stroke="${C.ink}" stroke-width="2"/>` : "") +
    border +
    turn +
    shield() +
    sword() +
    `</g></g>`
  );
}

/** @param {number} x @param {number} y @param {string} s @param {{ size?: number, fill?: string, anchor?: string, bold?: boolean }} [o] */
const text = (x, y, s, o = {}) =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${String(o.size ?? 13)}" fill="${o.fill ?? C.ink}"${o.bold === true ? ' font-weight="700"' : ""}${o.anchor === undefined ? "" : ` text-anchor="${o.anchor}"`}>${s}</text>`;

/** Captions that show one at a time, in step with the clip. @param {number} x @param {number} y */
function captions(x, y) {
  const dur = SOLO.length;
  return SOLO.captions
    .map(([s, from, to]) => {
      const keys = [0, from / dur, to / dur, 1].map((k) => String(Math.round(k * 1000) / 1000));
      const values = from === 0 ? "1;1;0;0" : "0;1;0;0";
      const body = text(x, y, s, { size: 12, fill: C.ink });
      return frameAt === undefined
        ? body
            .replace("<text ", `<text opacity="0" `)
            .replace(
              "</text>",
              `<animate attributeName="opacity" values="${values}" keyTimes="${keys.join(";")}" calcMode="discrete" dur="${f(dur)}s" repeatCount="indefinite"/></text>`,
            )
        : from <= frameAt && frameAt < to
          ? body
          : "";
    })
    .join("");
}

// ---------------------------------------------------------------------------
// The sheet.

const W = 1100;
const COL = 340;
const GAP = 20;
const FPS = 12;

/** One panel: a plate with a clip path, its content shifted so world (0,0) is the panel centre. */
/** @param {number} x @param {number} y @param {number} w @param {number} h @param {string} content @param {string} id */
const panel = (x, y, w, h, content, id) =>
  `<clipPath id="${id}"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/></clipPath>` +
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="6" fill="${C.panel}" stroke="${C.line}"/>` +
  `<g clip-path="url(#${id})"><g transform="translate(${f(x + w / 2)} ${f(y + h / 2)}) scale(${String(S)})">${content}</g></g>`;

/** The static strip: a standing body, a knocked down one, a dead one, per variant. @param {Variant} v @param {number} x @param {number} y */
function strip3(v, x, y) {
  const still = simulateBody([0, 0], [{ to: 1, face: 0 }], 1);
  const shapes = simulateCape(v, still, FPS);
  const stillBody = animatedBody(shapes, still, FPS, C.friend, false, 1, 0);
  const knocked =
    `<g opacity="0.7" transform="translate(70 0)">${animatedBody(shapes, still, FPS, C.friend, false, 1, 0)}</g>` +
    `<circle cx="70" cy="0" r="${String(R + 4)}" fill="none" stroke="${C.inkDim}" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  const dead = `<g transform="translate(140 0)"><circle r="${String(R)}" fill="#3a414d"/><circle r="${f(R - 0.75)}" fill="none" stroke="${C.edge}" stroke-width="1.5"/></g>`;
  return (
    panel(
      x,
      y,
      COL,
      56,
      `<g transform="translate(-70 0)">${stillBody}${knocked}${dead}</g>`,
      `strip${v.name.slice(0, 1)}`,
    ) + text(x + 10, y + 70, "standing | knocked down | dead", { size: 10, fill: C.inkDim })
  );
}

function sheet() {
  const parts = /** @type {[keyof typeof VARIANTS, number][]} */ ([
    ["A", 0],
    ["B", 1],
    ["C", 2],
  ]);
  const dur = SOLO.length;
  let out = "";
  for (const [key, col] of parts) {
    const v = VARIANTS[key];
    const x = GAP + col * (COL + GAP);
    out += text(x, 62, v.name, { size: 14, bold: true });

    // Solo clip.
    const body = simulateBody(SOLO.start, SOLO.intents, dur);
    const shapes = simulateCape(v, body, FPS);
    out += panel(
      x,
      74,
      COL,
      190,
      animatedBody(shapes, body, FPS, C.friend, true, dur, frameAt),
      `solo${key}`,
    );
    out += captions(x + 10, 284);

    // Pass clip: two bodies, same cape, past each other. The second is painted after the first.
    const pd = PASS.length;
    const left = simulateBody([-PASS.from, -PASS.lane], [{ to: pd, heading: 0, face: 0 }], pd);
    const right = simulateBody([PASS.from, PASS.lane], [{ to: pd, heading: 180, face: 180 }], pd);
    out += panel(
      x,
      298,
      COL,
      120,
      animatedBody(
        simulateCape(v, left, FPS),
        left,
        FPS,
        C.friend,
        false,
        pd,
        frameAt === undefined ? undefined : frameAt % pd,
      ) +
        animatedBody(
          simulateCape(v, right, FPS),
          right,
          FPS,
          C.foe,
          false,
          pd,
          frameAt === undefined ? undefined : frameAt % pd,
        ),
      `pass${key}`,
    );
    out += text(x + 10, 436, "5  two bodies walking past each other", { size: 12 });
    out += strip3(v, x, 448);
  }
  return out;
}

const H = 545;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(W)} ${String(H)}" width="${String(W)}" height="${String(H)}" font-family="system-ui, sans-serif">` +
  `<rect width="${String(W)}" height="${String(H)}" fill="${C.bg}"/>` +
  text(GAP, 30, "Guild cape in motion (#1686): study, not decided", { size: 18, bold: true }) +
  text(
    GAP,
    48,
    "Folded to a thin border when still, unfolds and trails opposite the movement, lags a turn. Plays when opened in a browser.",
    { size: 11, fill: C.inkDim },
  ) +
  sheet() +
  `</svg>\n`;

writeFileSync(outFile, svg);
console.log(`${outFile}: ${String(svg.length)} bytes`);
