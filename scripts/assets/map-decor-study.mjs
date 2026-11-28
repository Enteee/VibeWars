/* eslint-disable -- an SVG generator: untyped helpers, numbers go into strings everywhere. */
// Draws the gothic map-decoration study (#4252): sprite-stacked ground and wall
// pieces, with their variants, on two biome floors, and one vignette per biome
// family. A design reference, not a game asset. Deterministic: same output
// every run.
//
//   node scripts/assets/map-decor-study.mjs
//
// Writes docs/art/map-decor-study.svg, .png (via inkscape) and .md.
//
// Unit: one world unit is one px at zoom 1 (a body is about 28 u across, the
// ground tile 32 u). A piece is a list of slices, dark base to lit top
// (ADR-0057): each slice is a few shapes at one lift, shaded by its height,
// the top one outlined `#08080a` 1 px. The sun is north-west, so a piece's
// shadow lies south-east (visual-style §2, §3).

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const base = join(root, "docs", "art", "map-decor-study");

const OUTLINE = "#08080a";
const STEP = 1.5; // px of lift per slice, as the body's STACK_STEP

// ---------------------------------------------------------------------------
// Small helpers: seeded random, colour maths.

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const parse = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) =>
  "#" +
  c
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const mix = (a, b, t) => {
  const A = parse(a);
  const B = parse(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
};
const shade = (c, k) => toHex(parse(c).map((v) => v * k));
const f = (n) => String(Math.round(n * 100) / 100);

// ---------------------------------------------------------------------------
// Shapes: everything is points, so rotation and mirroring are one transform.

const poly = (pts) => ({ t: "poly", pts });
const blob = (cx, cy, rx, ry, n = 12, jit = 0, r = rng(7)) =>
  poly(
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const j = 1 + (r() - 0.5) * jit;
      return [cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j];
    }),
  );
const rect = (x, y, w, h) =>
  poly([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);
const line = (pts, w) => ({ t: "line", pts, w });
const slice = (c, ...shapes) => ({ c, shapes });
const lightSlice = (c, ...shapes) => ({ c, shapes, light: true });

/** A jagged crack from a to b. */
function crack(a, b, r, n = 6, amp = 3) {
  const pts = [a];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push([
      a[0] + (b[0] - a[0]) * t + (r() - 0.5) * amp * 2,
      a[1] + (b[1] - a[1]) * t + (r() - 0.5) * amp * 2,
    ]);
  }
  pts.push(b);
  return pts;
}

// ---------------------------------------------------------------------------
// The pieces. Each builds its slices from a seeded random, so a variant
// differs in its small shapes, not only in rotation. Colours are the muted
// materials of the graded biomes (visual-style §1); nothing glows but the
// lit fire pieces, whose slices say `light`.

const BONE = "#8d8878";
const STONE = "#5b6272";
const MOSS = "#4a5638";
const EARTH = "#4a3a2a";
const IRON = "#4c4f55";
const WOOD = "#4d3b2a";
const CLOTH = "#5a2a2e";
const EMBER = "#ff9040";

/** @type {{ id: string, kind: "ground"|"wall", note: string, suits: string[], build: (r: () => number) => any[] }[]} */
const PIECES = [
  // ---- ground -------------------------------------------------------------
  {
    id: "floor-crack",
    kind: "ground",
    note: "A split in the flagstone with a raised, chipped lip.",
    suits: ["stone", "sand", "frozen"],
    build: (r) => {
      const p = crack([-15, -4], [15, 5], r, 7, 3);
      const q = crack([-2, 0], [6, 12], r, 4, 2);
      return [
        slice("#0d0f14", line(p, 3.2), line(q, 2.4)),
        slice(
          "#3d4452",
          line(
            p.map(([x, y]) => [x - 0.6, y - 1]),
            1.2,
          ),
        ),
      ];
    },
  },
  {
    id: "moss-patch",
    kind: "ground",
    note: "A damp cushion of moss on a joint.",
    suits: ["stone", "swamp"],
    build: (r) => [
      slice("#2d3a24", blob(0, 0, 14, 9, 14, 0.5, r), blob(-8, 3, 5, 4, 8, 0.4, r)),
      slice(MOSS, blob(-1, -1, 10, 6, 12, 0.5, r)),
      slice("#66784c", blob(-2, -2, 5, 3, 8, 0.4, r)),
    ],
  },
  {
    id: "bone-scatter",
    kind: "ground",
    note: "Three long bones and a rib, lying where they fell.",
    suits: ["stone", "sand", "swamp", "frozen"],
    build: (r) => {
      const bone = (x, y, a, l) => {
        const dx = Math.cos(a) * l;
        const dy = Math.sin(a) * l;
        return [
          line(
            [
              [x, y],
              [x + dx, y + dy],
            ],
            2.6,
          ),
          blob(x, y, 2.2, 2.2, 6),
          blob(x + dx, y + dy, 2.2, 2.2, 6),
        ];
      };
      const a0 = r() * 3;
      return [
        slice(
          "#4f4c42",
          ...bone(-9, -4, a0, 15),
          ...bone(-5, 5, a0 + 1.4, 11),
          ...bone(3, -2, a0 + 2.6, 13),
        ),
        slice(
          BONE,
          ...bone(-9, -5, a0, 15),
          ...bone(-5, 4, a0 + 1.4, 11),
          ...bone(3, -3, a0 + 2.6, 13),
        ),
      ];
    },
  },
  {
    id: "skull",
    kind: "ground",
    note: "A lone skull, jaw slack, one socket in shadow.",
    suits: ["stone", "sand", "swamp", "frozen"],
    build: () => [
      slice("#4f4c42", blob(0, 1, 6, 5.5, 10)),
      slice("#78746a", blob(0, 0, 5.6, 5, 10), rect(-2.6, 3, 5.2, 3)),
      slice(BONE, blob(0, -1, 5, 4.4, 10)),
      slice("#a39e8d", blob(-1.2, -2, 2.6, 1.8, 8)),
      {
        c: "#15151a",
        shapes: [blob(-2, -0.5, 1.3, 1.5, 6), blob(2, -0.5, 1.3, 1.5, 6)],
        flat: true,
      },
    ],
  },
  {
    id: "rubble-heap",
    kind: "ground",
    note: "A low heap of broken stone, five chunks.",
    suits: ["stone", "sand", "frozen"],
    build: (r) => {
      const chunks = (dy, k) =>
        Array.from({ length: 5 }, (_, i) => {
          const a = (i / 5) * 6.28 + r();
          const d = 5 + r() * 4;
          return blob(
            Math.cos(a) * d,
            Math.sin(a) * d * 0.7 + dy,
            4.2 * k,
            3.4 * k,
            5 + Math.floor(r() * 2),
            0.5,
            r,
          );
        });
      return [
        slice("#323846", ...chunks(0, 1.1)),
        slice("#4a5262", ...chunks(-1, 0.9)),
        slice("#6a7284", blob(0, -3, 4, 3, 6, 0.4, r)),
      ];
    },
  },
  {
    id: "fallen-masonry",
    kind: "ground",
    note: "A cut block and a half block, mortar still on one face.",
    suits: ["stone", "sand"],
    build: () => [
      slice("#2f3541", rect(-13, -6, 17, 11), rect(2, 2, 11, 8)),
      slice("#434b5b", rect(-13, -8, 17, 11), rect(2, 0, 11, 8)),
      slice("#59627a", rect(-12, -9, 15, 4), rect(3, -1, 9, 3)),
      slice("#6c7690", rect(-12, -9, 15, 1.4)),
    ],
  },
  {
    id: "grave-slab",
    kind: "ground",
    note: "A tilted slab with a cross cut into it.",
    suits: ["stone", "swamp", "frozen"],
    build: () => [
      slice(
        "#2c313d",
        poly([
          [-9, -14],
          [9, -14],
          [11, 12],
          [-11, 12],
        ]),
      ),
      slice(
        "#40475a",
        poly([
          [-9, -15],
          [9, -15],
          [10, 10],
          [-10, 10],
        ]),
      ),
      slice(
        "#566078",
        poly([
          [-9, -16],
          [9, -16],
          [9, 8],
          [-9, 8],
        ]),
      ),
      { c: "#262b36", flat: true, shapes: [rect(-1, -12, 2, 15), rect(-5, -8, 10, 2)] },
    ],
  },
  {
    id: "rune-circle",
    kind: "ground",
    note: "A ring cut into the floor with four marks; dull, not lit.",
    suits: ["stone", "sand", "frozen"],
    build: () => {
      const ring = (rx, ry, w) => {
        const pts = Array.from({ length: 24 }, (_, i) => [
          Math.cos((i / 24) * 6.283) * rx,
          Math.sin((i / 24) * 6.283) * ry,
        ]);
        pts.push(pts[0]);
        return line(pts, w);
      };
      const ticks = [0, 1, 2, 3].map((i) => {
        const a = (i / 4) * 6.283 + 0.6;
        return line(
          [
            [Math.cos(a) * 7, Math.sin(a) * 5.4],
            [Math.cos(a) * 12, Math.sin(a) * 9],
          ],
          1.6,
        );
      });
      return [
        slice("#1b1e27", ring(15, 11, 2.8), ring(9, 6.6, 1.6), ...ticks),
        slice("#454c60", ring(15, 11, 1), ...ticks.map((t) => ({ ...t, w: 0.8 }))),
      ];
    },
  },
  {
    id: "puddle",
    kind: "ground",
    note: "Standing water, grey and dull; never the water blue of a zone.",
    suits: ["stone", "swamp", "sand"],
    build: (r) => [
      slice("#171a20", blob(0, 0, 14, 8, 14, 0.4, r)),
      slice("#2b3238", blob(0, 0, 12.5, 6.8, 14, 0.4, r)),
      {
        c: "#454d52",
        flat: true,
        shapes: [
          line(
            [
              [-6, -2],
              [-1, -3],
            ],
            1,
          ),
          line(
            [
              [2, 1],
              [7, 0],
            ],
            1,
          ),
        ],
      },
    ],
  },
  {
    id: "roots",
    kind: "ground",
    note: "A knot of roots breaking the flagstone.",
    suits: ["stone", "swamp"],
    build: (r) => {
      const arm = (a, l) => {
        const pts = [[0, 0]];
        for (let i = 1; i <= 4; i++)
          pts.push([
            (Math.cos(a + (r() - 0.5) * 0.7) * (l * i)) / 4,
            (Math.sin(a + (r() - 0.5) * 0.7) * (l * i)) / 4,
          ]);
        return pts;
      };
      const arms = [arm(0.2, 15), arm(2.3, 13), arm(4.2, 12), arm(5.4, 10)];
      return [
        slice("#2c2218", ...arms.map((p) => line(p, 4.4))),
        slice(EARTH, ...arms.map((p) => line(p, 3))),
        slice(
          "#6a5238",
          ...arms.map((p) =>
            line(
              p.map(([x, y]) => [x - 0.5, y - 0.9]),
              1,
            ),
          ),
        ),
      ];
    },
  },
  {
    id: "ash-drift",
    kind: "ground",
    note: "A soft drift of ash and dead leaves against the wind.",
    suits: ["stone", "sand", "swamp", "frozen"],
    build: (r) => [
      slice("#3a3835", blob(0, 0, 15, 7, 12, 0.5, r)),
      slice("#57534c", blob(-1, -1, 11, 4.6, 12, 0.5, r)),
      slice(
        "#6f6a5f",
        ...Array.from({ length: 4 }, () => blob((r() - 0.5) * 18, (r() - 0.5) * 6, 1.8, 1.2, 5)),
      ),
    ],
  },
  {
    id: "broken-sword",
    kind: "ground",
    note: "A blade snapped at the middle, hilt a hand away.",
    suits: ["stone", "sand", "swamp", "frozen"],
    build: () => [
      slice(
        "#262a30",
        line(
          [
            [-14, 3],
            [-2, -1],
          ],
          3.4,
        ),
        line(
          [
            [4, -1],
            [12, -4],
          ],
          3.2,
        ),
        line(
          [
            [2, -5],
            [6, 3],
          ],
          2.6,
        ),
      ),
      slice(
        "#767c88",
        line(
          [
            [-14, 2.4],
            [-2, -1.6],
          ],
          2,
        ),
        line(
          [
            [4, -1.6],
            [12, -4.6],
          ],
          1.8,
        ),
      ),
      slice(
        "#9aa0aa",
        line(
          [
            [-14, 1.8],
            [-2, -2],
          ],
          0.8,
        ),
      ),
      slice(
        "#6a5830",
        line(
          [
            [2, -5],
            [6, 3],
          ],
          1.6,
        ),
      ),
    ],
  },
  {
    id: "chain-pile",
    kind: "ground",
    note: "A heap of iron chain and one open shackle.",
    suits: ["stone", "sand", "swamp"],
    build: (r) => {
      const links = Array.from({ length: 8 }, (_, i) => {
        const a = i * 0.9;
        return blob(Math.cos(a) * (3 + i), Math.sin(a) * (2.5 + i * 0.5), 3, 2, 7, 0.2, r);
      });
      return [
        slice("#1b1d21", ...links),
        slice(
          IRON,
          ...links.map((l) => ({ ...l, pts: l.pts.map(([x, y]) => [x * 0.88, y * 0.88 - 1]) })),
        ),
        slice("#757b85", blob(-1, -3, 2.4, 1.4, 6)),
      ];
    },
  },
  {
    id: "broken-urn",
    kind: "ground",
    note: "A cracked clay urn on its side, spilling ash.",
    suits: ["stone", "sand", "swamp"],
    build: () => [
      slice("#3a2a1f", blob(0, 1, 8, 6, 10), blob(9, 3, 5, 3.4, 8)),
      slice("#5c4330", blob(0, -1, 7.4, 5.4, 10), rect(4, -3, 8, 6)),
      slice("#7a5a40", blob(-1, -2.4, 4.6, 3, 8)),
      { c: "#1a1613", flat: true, shapes: [blob(-6, -1, 2.6, 3, 7)] },
    ],
  },

  // ---- wall ---------------------------------------------------------------
  {
    id: "banner-torn",
    kind: "wall",
    note: "A hanging banner, hem torn to three tongues, a crest in dull gold.",
    suits: ["stone", "sand", "frozen"],
    build: () => [
      slice(
        "#2e1519",
        poly([
          [-7, 0],
          [7, 0],
          [7, 24],
          [3, 20],
          [0, 26],
          [-3, 20],
          [-7, 24],
        ]),
      ),
      slice(
        CLOTH,
        poly([
          [-6, 1],
          [6, 1],
          [6, 22],
          [3, 19],
          [0, 24],
          [-3, 19],
          [-6, 22],
        ]),
      ),
      slice(
        "#6e3a3e",
        poly([
          [-5, 2],
          [-1, 2],
          [-1, 18],
          [-5, 20],
        ]),
      ),
      {
        c: "#6a5830",
        flat: true,
        shapes: [
          poly([
            [0, 7],
            [3, 11],
            [0, 15],
            [-3, 11],
          ]),
        ],
      },
      slice("#3a3a40", rect(-9, -1, 18, 2.4)),
    ],
  },
  {
    id: "torch-bracket-unlit",
    kind: "wall",
    note: "An iron bracket holding a dead torch.",
    suits: ["stone", "sand", "swamp", "frozen"],
    build: () => [
      slice("#1b1d21", rect(-2, 6, 4, 10), rect(-4, 14, 8, 3)),
      slice(IRON, rect(-1.6, 6, 3.2, 9), rect(-3.6, 13, 7.2, 2.2)),
      slice("#3a2a1c", rect(-2.4, -2, 4.8, 10)),
      slice("#1d1a18", blob(0, -3, 3.6, 2.4, 7)),
    ],
  },
  {
    id: "torch-bracket-lit",
    kind: "wall",
    note: "The same bracket with a flame: a fire light, `#ffb060`, radius 150.",
    suits: ["stone", "sand", "swamp", "frozen"],
    build: () => [
      slice("#1b1d21", rect(-2, 6, 4, 10), rect(-4, 14, 8, 3)),
      slice(IRON, rect(-1.6, 6, 3.2, 9), rect(-3.6, 13, 7.2, 2.2)),
      slice("#3a2a1c", rect(-2.4, -2, 4.8, 10)),
      lightSlice(
        "#b0481a",
        poly([
          [-4, -2],
          [4, -2],
          [2.6, -9],
          [0, -14],
          [-2.6, -9],
        ]),
      ),
      lightSlice(
        EMBER,
        poly([
          [-2.6, -2],
          [2.6, -2],
          [1.4, -8],
          [0, -11],
          [-1.4, -8],
        ]),
      ),
      lightSlice(
        "#ffd890",
        poly([
          [-1.2, -2],
          [1.2, -2],
          [0, -7],
        ]),
      ),
    ],
  },
  {
    id: "creeping-vines",
    kind: "wall",
    note: "Ivy climbing from the foot, in leaf runs.",
    suits: ["stone", "swamp"],
    build: (r) => {
      const stem = crack([2, 26], [-3, 0], r, 6, 3);
      const leaves = (dx) =>
        stem
          .slice(1)
          .flatMap(([x, y]) => [
            blob(x + dx, y, 2.6, 1.8, 6, 0.3, r),
            blob(x - dx, y + 2, 2.2, 1.6, 6, 0.3, r),
          ]);
      return [
        slice("#1d2616", line(stem, 3)),
        slice("#33432a", ...leaves(3)),
        slice("#4f6a3c", ...leaves(2.4).filter((_, i) => i % 2 === 0)),
      ];
    },
  },
  {
    id: "hanging-chain",
    kind: "wall",
    note: "A chain from a ring, ending in an empty cuff.",
    suits: ["stone", "sand", "swamp"],
    build: () => {
      const links = Array.from({ length: 7 }, (_, i) => blob(0, 3 + i * 3.6, 1.7, 2.2, 6));
      return [
        slice("#1b1d21", blob(0, 0, 3.4, 3.4, 8), ...links, blob(0, 29, 4.4, 3.6, 8)),
        slice(
          IRON,
          blob(0, -0.6, 2.6, 2.6, 8),
          ...links.map((l) => ({ ...l, pts: l.pts.map(([x, y]) => [x * 0.7, y - 0.4]) })),
        ),
        slice("#757b85", blob(-0.6, -1.4, 1.2, 1.2, 5)),
      ];
    },
  },
  {
    id: "wall-crack",
    kind: "wall",
    note: "A long fracture with a flaked edge.",
    suits: ["stone", "sand", "frozen"],
    build: (r) => {
      const p = crack([-2, -2], [3, 30], r, 8, 3);
      return [
        slice("#0d0f14", line(p, 3.4)),
        slice(
          "#4a5262",
          line(
            p.map(([x, y]) => [x - 1, y]),
            1,
          ),
        ),
      ];
    },
  },
  {
    id: "iron-grating",
    kind: "wall",
    note: "A barred vent, five bars, dark behind. Never a door.",
    suits: ["stone", "sand", "swamp"],
    build: () => [
      slice("#07080b", rect(-9, 2, 18, 14)),
      slice(
        "#1f2126",
        rect(-10, 1, 20, 2.4),
        rect(-10, 15, 20, 2.4),
        rect(-10, 1, 2.4, 16),
        rect(8, 1, 2.4, 16),
      ),
      slice(IRON, ...[-5, -2.5, 0, 2.5, 5].map((x) => rect(x - 0.6, 3, 1.4, 12))),
      slice("#6b717c", rect(-10, 0.4, 20, 1.2)),
    ],
  },
  {
    id: "torch-candle-niche",
    kind: "wall",
    note: "A niche with three candles; a small fire light, radius 90.",
    suits: ["stone", "sand", "frozen"],
    build: () => [
      slice("#07080b", rect(-8, 0, 16, 18)),
      slice("#2a2e38", rect(-9, -1, 18, 2), rect(-9, 17, 18, 2)),
      slice("#a39a82", rect(-6, 10, 3, 6), rect(-1.4, 7, 3, 9), rect(3.4, 11, 3, 5)),
      lightSlice(
        "#ffb060",
        poly([
          [-5.4, 10],
          [-3.6, 10],
          [-4.5, 6],
        ]),
        poly([
          [-0.8, 7],
          [0.8, 7],
          [0, 2],
        ]),
        poly([
          [4, 11],
          [5.6, 11],
          [4.8, 7],
        ]),
      ),
    ],
  },
  {
    id: "carved-relief",
    kind: "wall",
    note: "A shallow relief panel: a hooded figure with bowed head.",
    suits: ["stone", "sand", "frozen"],
    build: () => [
      slice("#262b36", rect(-11, 0, 22, 28)),
      slice("#3c4354", rect(-10, 1, 20, 26)),
      slice(
        "#4c5468",
        poly([
          [-4, 26],
          [4, 26],
          [5, 12],
          [2, 6],
          [-2, 6],
          [-5, 12],
        ]),
      ),
      slice("#5d6680", blob(0, 8, 3.4, 3.4, 8)),
    ],
  },
  {
    id: "cobweb",
    kind: "wall",
    note: "A web in a corner, thin and pale.",
    suits: ["stone", "sand", "swamp"],
    build: () => {
      const spokes = [
        [16, 0],
        [12, 10],
        [6, 15],
        [0, 17],
      ].map(([x, y]) =>
        line(
          [
            [0, 0],
            [x, y],
          ],
          0.7,
        ),
      );
      const arcs = [6, 11, 16].map((r) =>
        line(
          [
            [r, 0],
            [r * 0.8, r * 0.55],
            [r * 0.42, r * 0.9],
            [0, r],
          ],
          0.6,
        ),
      );
      return [
        { c: "#8a8d94", flat: true, shapes: [...spokes, ...arcs] },
        slice("#a5a8af", blob(7, 6, 1.1, 1.1, 5)),
      ];
    },
  },
  {
    id: "moss-run",
    kind: "wall",
    note: "A damp run of moss down a joint, thickest at the foot.",
    suits: ["stone", "swamp"],
    build: (r) => [
      slice(
        "#25301d",
        poly([
          [-3, 0],
          [3, 0],
          [5, 12],
          [10, 26],
          [-9, 26],
          [-4, 12],
        ]),
      ),
      slice(
        MOSS,
        ...Array.from({ length: 6 }, (_, i) =>
          blob((r() - 0.5) * 8, 4 + i * 4, 3 + i * 0.5, 2.4, 7, 0.4, r),
        ),
      ),
      slice("#66784c", blob(-1, 20, 3, 1.8, 6)),
    ],
  },
  {
    id: "shield-plaque",
    kind: "wall",
    note: "A dented iron shield nailed up, boss and rim.",
    suits: ["stone", "sand", "frozen"],
    build: () => [
      slice(
        "#1b1d21",
        poly([
          [-9, 0],
          [9, 0],
          [9, 12],
          [0, 24],
          [-9, 12],
        ]),
      ),
      slice(
        IRON,
        poly([
          [-8, 1],
          [8, 1],
          [8, 11.4],
          [0, 22],
          [-8, 11.4],
        ]),
      ),
      slice(
        "#3a3d44",
        poly([
          [-5.4, 3],
          [5.4, 3],
          [5.4, 10.6],
          [0, 17.4],
          [-5.4, 10.6],
        ]),
      ),
      slice("#767c88", blob(0, 9, 2.6, 2.6, 8)),
    ],
  },
];

// ---------------------------------------------------------------------------
// Biome families: floor, wall top, tint of the pieces (graded, visual-style §1).

const FAMILIES = [
  {
    id: "stone",
    name: "Grey stone",
    floor: "#1d2531",
    top: "#3a4659",
    tint: null,
    wall: "#22293a",
  },
  {
    id: "sand",
    name: "Warm sandstone",
    floor: "#2e271e",
    top: "#5d5142",
    tint: ["#a08060", 0.18],
    wall: "#3a3228",
  },
  {
    id: "frozen",
    name: "Frozen",
    floor: "#56616a",
    top: "#3d3b3b",
    tint: ["#a8b8c4", 0.28],
    wall: "#2c2c2f",
  },
  {
    id: "swamp",
    name: "Swamp",
    floor: "#202924",
    top: "#41453d",
    tint: ["#4a5a3a", 0.2],
    wall: "#2c2f2a",
  },
];

const FRAC = { stone: 0 };
FRAC;

// ---------------------------------------------------------------------------
// Rendering a piece.

const ROT = (v) => [Math.cos(v), Math.sin(v)];

/** variant: { rot (rad), mirror, tint ([colour, amount]) }. Returns the bounding box too. */
function renderPiece(piece, seed, variant, scale, fam) {
  const r = rng(seed);
  const slices = piece.build(r);
  const [co, si] = ROT(variant.rot);
  const tx = ([x, y]) => {
    const mx = variant.mirror ? -x : x;
    return [mx * co - y * si, mx * si + y * co];
  };
  const n = slices.length;
  let minX = 1e9;
  let maxX = -1e9;
  let minY = 1e9;
  let maxY = -1e9;
  const out = [];
  const shadow = [];
  slices.forEach((s, i) => {
    const t = n > 1 ? i / (n - 1) : 1;
    let col = s.c;
    const lit = s.light || s.flat;
    if (!lit) col = shade(col, 0.62 + 0.38 * t);
    const tint = variant.tint ?? fam.tint;
    if (tint && !s.light) col = mix(col, tint[0], tint[1]);
    const lift = s.flat ? 0 : i * STEP;
    const pts = [];
    for (const sh of s.shapes) {
      if (sh.t === "poly") {
        const P = sh.pts.map(tx).map(([x, y]) => [x, y - lift]);
        pts.push(...P);
        out.push(
          `<polygon points="${P.map(([x, y]) => `${f(x * scale)},${f(y * scale)}`).join(" ")}" fill="${col}" ${i === n - 1 || i === 0 ? `stroke="${OUTLINE}" stroke-width="${f(0.8 * Math.min(scale, 1.4))}" stroke-linejoin="round"` : ""}/>`,
        );
        if (i === 0 && !s.flat) shadow.push(P);
      } else {
        const P = sh.pts.map(tx).map(([x, y]) => [x, y - lift]);
        pts.push(...P);
        out.push(
          `<polyline points="${P.map(([x, y]) => `${f(x * scale)},${f(y * scale)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="${f(sh.w * scale)}" stroke-linecap="round" stroke-linejoin="round"/>`,
        );
      }
    }
    for (const [x, y] of pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  });
  // Shadow: the base outline pushed south-east, dark and soft (ground pieces only).
  const sh =
    piece.kind === "ground" && n > 2
      ? shadow
          .map(
            (P) =>
              `<polygon points="${P.map(([x, y]) => `${f((x + 1.6) * scale)},${f((y + 1.2) * scale)}`).join(" ")}" fill="#000" fill-opacity="0.35"/>`,
          )
          .join("")
      : "";
  return { svg: sh + out.join(""), w: maxX - minX, h: maxY - minY, slices: n };
}

// ---------------------------------------------------------------------------
// The sheet.

const W = 1400;
const C = { bg: "#0e1116", panel: "#141a22", ink: "#d7dee8", dim: "#7d8899" };
const parts = [];
const text = (x, y, s, size = 12, fill = C.ink, extra = "") =>
  parts.push(
    `<text x="${f(x)}" y="${f(y)}" font-family="DejaVu Sans, sans-serif" font-size="${size}" fill="${fill}" ${extra}>${s}</text>`,
  );

/** A tile of floor with grain, at the scale, w x h px. */
function floor(x, y, w, h, fam, seed, scale) {
  const r = rng(seed);
  const cells = [];
  const step = 16 * scale;
  for (let gy = 0; gy < h; gy += step) {
    for (let gx = 0; gx < w; gx += step) {
      const k = 0.9 + r() * 0.2;
      cells.push(
        `<rect x="${f(gx)}" y="${f(gy)}" width="${f(step)}" height="${f(step)}" fill="${shade(fam.floor, k)}"/>`,
      );
    }
  }
  parts.push(
    `<g transform="translate(${f(x)} ${f(y)})"><clipPath id="c${seed}x${Math.round(x)}y${Math.round(y)}"><rect width="${w}" height="${h}"/></clipPath><g clip-path="url(#c${seed}x${Math.round(x)}y${Math.round(y)})">${cells.join("")}</g></g>`,
  );
}

/** A wall: a lit top strip and a face with joints, w x h px at scale. */
function wallStrip(x, y, w, fam, scale, faceH = 36) {
  const topH = 12 * scale;
  const faceHpx = faceH * scale;
  const r = rng(99);
  let joints = "";
  for (let j = 0; j < faceH; j += 12) {
    joints += `<line x1="0" y1="${f((j + 6) * scale)}" x2="${f(w)}" y2="${f((j + 6) * scale)}" stroke="#000" stroke-opacity="0.28" stroke-width="${f(scale)}"/>`;
    for (let k = (j / 12) % 2 ? 0 : 12; k < w / scale; k += 24) {
      joints += `<line x1="${f(k * scale)}" y1="${f(j * scale)}" x2="${f(k * scale)}" y2="${f((j + 12) * scale)}" stroke="#000" stroke-opacity="0.28" stroke-width="${f(scale)}"/>`;
    }
  }
  r;
  parts.push(
    `<g transform="translate(${f(x)} ${f(y)})"><rect width="${f(w)}" height="${f(topH)}" fill="${fam.top}" stroke="${OUTLINE}" stroke-width="${f(scale)}"/><rect y="${f(topH)}" width="${f(w)}" height="${f(faceHpx)}" fill="${fam.wall}"/>${joints.replace(/y1="/g, `y1="`)}</g>`,
  );
  return { faceTop: y + topH };
}

const familyOf = (id) => FAMILIES.find((x) => x.id === id);
const VARIANTS = [
  { rot: 0, mirror: false, tint: null },
  { rot: 2.2, mirror: true, tint: ["#6a6a6a", 0.14] },
  { rot: 4.4, mirror: false, tint: ["#3a2a1a", 0.14] },
];
const WALL_VARIANTS = [
  { rot: 0, mirror: false, tint: null },
  { rot: 0, mirror: true, tint: ["#6a6a6a", 0.14] },
  { rot: 0, mirror: false, tint: ["#3a2a1a", 0.14] },
];

const rows = [];
const catalog = [];

function placePiece(piece, seed, variant, scale, fam, cx, cy) {
  const p = renderPiece(piece, seed, variant, scale, fam);
  parts.push(`<g transform="translate(${f(cx)} ${f(cy)})">${p.svg}</g>`);
  return p;
}

let y = 20;
text(20, y + 10, "VibeWars map decoration study (#4252)", 20);
text(
  20,
  y + 30,
  "Sprite-stacked gothic ground and wall pieces. 1 unit = 1 px at zoom 1. Dark base to lit top, 1 px outline #08080a, sun north-west. Decoration only: no collision, no walk cost, no meaning in the fight.",
  11,
  C.dim,
);
y += 52;

// -- vignettes ---------------------------------------------------------------
text(20, y + 10, "Vignettes: one dressed hall per biome family (zoom 2)", 14);
y += 22;
const VW = 330;
const VH = 150;
const VS = 2;
FAMILIES.forEach((fam, k) => {
  const ox = 20 + ((k % 2) * ((VW * VS) / 1 + 20)) / 1;
  const oy = y + Math.floor(k / 2) * (VH * VS + 40);
  ox;
});
const vw = 680;
const vh = 300;
FAMILIES.forEach((fam, k) => {
  const ox = 20 + (k % 2) * (vw + 20);
  const oy = y + Math.floor(k / 2) * (vh + 36);
  floor(ox, oy, vw, vh, fam, 11 + k, VS);
  wallStrip(ox, oy, vw, fam, VS, 36);
  const r = rng(500 + k);
  const ground = PIECES.filter((p) => p.kind === "ground" && p.suits.includes(fam.id));
  const wall = PIECES.filter((p) => p.kind === "wall" && p.suits.includes(fam.id));
  const items = [];
  for (let i = 0; i < 14; i++) {
    const pc = ground[Math.floor(r() * ground.length)];
    items.push({
      pc,
      x: 30 + r() * (vw - 60),
      y: 96 + r() * (vh - 130),
      seed: Math.floor(r() * 1e6),
      v: VARIANTS[Math.floor(r() * 3)],
    });
  }
  items.sort((a, b) => a.y - b.y);
  // walls first (behind), then ground
  const used = [];
  for (let i = 0; i < 7; i++) {
    const pc = wall[Math.floor(r() * wall.length)];
    const x = 40 + i * ((vw - 80) / 6) + (r() - 0.5) * 12;
    used.push({ pc, x });
    placePiece(
      pc,
      Math.floor(r() * 1e6),
      WALL_VARIANTS[Math.floor(r() * 3)],
      VS,
      fam,
      ox + x,
      oy + 12 * VS + 4,
    );
  }
  for (const it of items) placePiece(it.pc, it.seed, it.v, VS, fam, ox + it.x, oy + it.y);
  // a body for scale, mid floor
  parts.push(
    `<g transform="translate(${ox + vw / 2} ${oy + vh - 50})"><ellipse cx="0" cy="6" rx="${14 * VS * 0.5}" ry="${6 * VS * 0.5}" fill="#000" fill-opacity="0.4"/><rect x="${-10}" y="${-24}" width="20" height="28" rx="8" fill="#59c2ff" stroke="${OUTLINE}" stroke-width="1.5"/></g>`,
  );
  text(
    ox + 8,
    oy + vh - 8,
    fam.name,
    12,
    "#e8e8e8",
    `stroke="#000" stroke-width="3" paint-order="stroke"`,
  );
});
y += 2 * (vh + 36) + 6;

// -- tables -----------------------------------------------------------------
const COLS = [
  { x: 230, label: "zoom 1, cold" },
  { x: 330, label: "zoom 2, cold" },
  { x: 470, label: "zoom 1, warm" },
  { x: 570, label: "zoom 2, warm" },
  { x: 715, label: "variants (zoom 1, cold)" },
];
function table(kind, title) {
  text(20, y + 10, title, 14);
  y += 20;
  for (const c of COLS) text(c.x, y + 8, c.label, 10, C.dim);
  y += 14;
  const list = PIECES.filter((p) => p.kind === kind);
  const rowH = kind === "wall" ? 132 : 80;
  for (const [idx, pc] of list.entries()) {
    parts.push(
      `<rect x="12" y="${y}" width="${W - 24}" height="${rowH - 4}" fill="${C.panel}" rx="4"/>`,
    );
    const seed = 1000 + idx * 17 + (kind === "wall" ? 300 : 0);
    const cold = familyOf("stone");
    const warm = familyOf("sand");
    const cells = [
      [230, 1, cold],
      [330, 2, cold],
      [470, 1, warm],
      [570, 2, warm],
    ];
    let info;
    for (const [cx, sc, fam] of cells) {
      const w = sc === 1 ? 90 : 130;
      const h = rowH - 12;
      const fx = cx - 6;
      const fy = y + 4;
      if (kind === "wall") {
        floor(fx, fy, w, h, fam, seed + cx, sc);
        const ws = wallStrip(fx, fy, w, fam, sc, 40);
        info = placePiece(pc, seed, VARIANTS[0], sc, fam, fx + w / 2, ws.faceTop + 6 * sc);
      } else {
        floor(fx, fy, w, h, fam, seed + cx, sc);
        info = placePiece(pc, seed, VARIANTS[0], sc, fam, fx + w / 2, fy + h / 2 + 4);
      }
    }
    // variants
    for (let v = 0; v < 3; v++) {
      const fx = 715 + v * 100;
      const fy = y + 4;
      floor(fx, fy, 92, rowH - 12, familyOf("stone"), seed + 40 + v, 1);
      if (kind === "wall") {
        const ws = wallStrip(fx, fy, 92, familyOf("stone"), 1, 40);
        placePiece(
          pc,
          seed + v * 7,
          WALL_VARIANTS[v],
          1,
          familyOf("stone"),
          fx + 46,
          ws.faceTop + 6,
        );
      } else {
        placePiece(
          pc,
          seed + v * 7,
          VARIANTS[v],
          1,
          familyOf("stone"),
          fx + 46,
          fy + (rowH - 12) / 2 + 4,
        );
      }
    }
    const fp = `${Math.ceil(info.w)} x ${Math.ceil(info.h)} u`;
    const lit = pc.build(rng(seed)).some((s) => s.light);
    catalog.push({ pc, fp, slices: info.slices, lit, w: info.w, h: info.h });
    text(24, y + 20, pc.id, 13, lit ? "#ffb060" : C.ink);
    text(24, y + 38, `footprint ${fp}, ${info.slices} slices${lit ? ", LIGHT" : ""}`, 10, C.dim);
    text(24, y + 54, `suits: ${pc.suits.join(", ")}`, 10, C.dim);
    // the note, wrapped
    const words = pc.note.split(" ");
    let ln = "";
    let ly = 1130;
    ly;
    const lines = [];
    for (const wd of words) {
      if ((ln + wd).length > 60) {
        lines.push(ln);
        ln = "";
      }
      ln += wd + " ";
    }
    lines.push(ln);
    lines.forEach((l, i) => text(1030, y + 24 + i * 14, l, 10, C.dim));
    y += rowH;
  }
  y += 14;
}
table("ground", `Ground pieces (${PIECES.filter((p) => p.kind === "ground").length})`);
table(
  "wall",
  `Wall pieces (${PIECES.filter((p) => p.kind === "wall").length}), on the face under a lit wall top`,
);

const H = y + 10;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${C.bg}"/>${parts.join("")}</svg>`;
writeFileSync(`${base}.svg`, svg);
execFileSync(
  "inkscape",
  [
    `${base}.svg`,
    "--export-type=png",
    `--export-filename=${base}.png`,
    "--export-background-opacity=1",
  ],
  { stdio: "ignore" },
);

// ---------------------------------------------------------------------------
// The catalogue, for the notes.

const md = [];
md.push("# Map decoration study (#4252)", "");
md.push(
  "Design only. `scripts/assets/map-decor-study.mjs` draws `map-decor-study.svg` and `.png`; this page is written by the same run.",
  "A piece is pure decoration: no collision, no walk cost, no meaning in the fight (the contract of `render/ground-dressing.ts`).",
  "",
  "## Rules the set follows",
  "",
  "- Palette: the graded biome tones of `visual-style.md` §1, muted; piece colours stay within about one step of the floor in value. Nothing is warm except the lit fire pieces, nothing is blue (friend, help), red (foe, damage) or bright green (nature).",
  "- Stacking (ADR-0057): dark base to lit top, `STEP` 1.5 px a slice, 1 px outline `#08080a` on the base and the top slice. Ground pieces cast a soft south-east shadow (sun north-west, §2).",
  "- Readability (§6): decoration is darker and lower in contrast than any zone edge or body, and sits under bodies. Wall pieces hang on the wall face, never on the walkable floor, and never read as a door, a lever or a blocking wall: the grating is dark bars on black, no frame colour, no glow.",
  "- Only `torch-`/`fire-`/`brazier-` pieces light (§2). Here: `torch-bracket-lit` (torch light `#ffb060`, radius 150) and `torch-candle-niche` (small, radius 90). They count toward a map's 16 lights, so a map places few.",
  "- Originals: no GW1 name, shape or look.",
  "- Under 16 px across at zoom 1, a piece is a mark (one shape, one colour, one outline): `skull`, `broken-sword`, `chain-pile` and the wall bracket are the smallest and keep to that.",
  "",
  "## Pieces",
  "",
  "| id | kind | footprint (u) | slices | lights | biomes | note |",
  "| -- | ---- | ------------- | ------ | ------ | ------ | ---- |",
);
for (const c of catalog) {
  md.push(
    `| \`${c.pc.id}\` | ${c.pc.kind} | ${c.fp} | ${c.slices} | ${c.lit ? "yes" : "no"} | ${c.pc.suits.join(", ")} | ${c.pc.note} |`,
  );
}
const slicesAll = catalog.reduce((a, c) => a + c.slices, 0);
const ground = catalog.filter((c) => c.pc.kind === "ground");
const wall = catalog.filter((c) => c.pc.kind === "wall");
const avgPx = (arr) => arr.reduce((a, c) => a + (c.w + 4) * (c.h + 4), 0) / arr.length;
const gpx = Math.round(avgPx(ground));
const wpx = Math.round(avgPx(wall));
const drawMs = ((40 * gpx + 15 * wpx) * 50e-6).toFixed(2); // 50 ns per textured px, as ADR-0054
md.push(
  "",
  "## Variants",
  "",
  "Each piece ships 3 variants: ground pieces turn (any angle) and mirror, wall pieces mirror only (they hang). Each variant re-seeds the piece's small shapes (a crack's path, a leaf's place) and nudges the tint (cooler, warmer, per biome family). A map picks the variant by a hash of the piece's position, so a repeat does not read as a stamp.",
  "",
  "## Cost (estimate)",
  "",
  `Average ground piece ${gpx} px², wall piece ${wpx} px² at zoom 1 (slice count ${(slicesAll / catalog.length).toFixed(1)} on average).`,
  "Like the bodies of ADR-0057, a piece is baked once at match start into an atlas, never drawn live (a live piece is 4 to 8 polygons re-tessellated each frame).",
  "",
  `- **Draw**: a sprite per piece. A typical scatter of 40 ground and 15 wall pieces is about ${(40 * gpx + 15 * wpx).toLocaleString("en")} px², about **${drawMs} ms** a frame at ADR-0054's 50 ns per textured pixel, if all are on screen. A camera sees about a third of a map: expect **under 1 ms**. The 8v8 crowd costs 1.35 ms of update (benchmarks.md), so a dressed map adds up to half of that in the worst case; the bench must show it before the follow-up switches it on.`,
  `- **Bake**: ${PIECES.length} pieces × 3 variants = ${PIECES.length * 3} images, about ${Math.round((((PIECES.length * 3 * (gpx + wpx)) / 2) * 4) / 1024)} KB of texture per biome (4 B a pixel), baked once at load. A map bakes only the pieces it lists.`,
  "- **Cheaper still**: ground pieces under 16 px can be painted into the ground tile (`ground-dressing.ts`), at zero draw cost, as repeats. The study's `floor-crack`, `moss-patch`, `ash-drift` and `puddle` suit that; the rest are placed sprites.",
  "- **Lights**: at most 4 lit pieces on a map (of the 16 allowed).",
  "",
  "## Not in this study",
  "",
  "How a map places pieces (data, density, no-go zones), the renderer, and the per-map dressing: follow-up cards after the operator approves the sheet. Water, zone and border shapes: #4251.",
  "",
);
writeFileSync(`${base}.md`, md.join("\n"));
console.log(
  `${PIECES.length} pieces; ${ground.length} ground, ${wall.length} wall; draw ${drawMs} ms worst case`,
);
