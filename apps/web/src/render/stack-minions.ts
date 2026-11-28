import type { CreatureLook } from "@vibewars/game-core";

import { type CreaturePose, STACK_OUTLINE, type StackSlice, ellipse } from "./sprite-stack.js";
import type { Point } from "./weapon-mark-geometry.js";

/**
 * A Necromancer's minions as stacked figures (#4172): bone minions and
 * horrors are skeletons, rib rings around dark gaps under a pale skull,
 * and the flesh golem a stitched mass. Ported from the creature stack
 * study (`docs/art/creature-stack-study.md`), in body radii, `x` forward
 * and `y` to the right, like `stackSlices`.
 */

const BONE = 0xd8d0bc;
const BONE_GAP = 0x2a2622;
const FLESH = 0xb9a58f;
const SEAM = 0x3a2a2a;
const BLOOD = 0x7a1f2b;

/**
 * Slices built one after another, each on a new lift or on the `same` one
 * as the last, or `at` a lift of the build already made. A figure `tall`
 * times its build's height lays each slice on as many lifts as it then
 * spans, so it stands taller, still solid; one `wide` times its build's
 * breadth spreads every part out from its middle.
 */
class Slices {
  readonly list: StackSlice<number>[] = [];
  readonly #tall: number;
  readonly #wide: number;
  #lift = -1;

  constructor(tall: number, wide = 1) {
    this.#tall = tall;
    this.#wide = wide;
  }

  push(parts: Point[][], tone: number, light: number, same = false, alpha = 1): void {
    if (!same) {
      this.#lift += 1;
    }
    this.at(this.#lift, parts, tone, light, alpha);
  }

  at(build: number, parts: Point[][], tone: number, light: number, alpha = 1): void {
    const wide = parts.map((part) =>
      part.map((p) => ({ x: p.x * this.#wide, y: p.y * this.#wide })),
    );
    const from = Math.floor(build * this.#tall);
    const to = Math.max(from + 1, Math.floor((build + 1) * this.#tall));
    for (let lift = from; lift < to; lift += 1) {
      this.list.push({ parts: wide, tone, light, lift, rise: 0, alpha });
    }
  }
}

/** What shows between a skeleton's ribs: its tone, and how lit its lowest gap is. */
interface Gap {
  readonly tone: number;
  readonly light: number;
}

const DARK_GAP: Gap = { tone: BONE_GAP, light: 0.45 };
/** Lit past full, so it glows. */
const BLOOD_GAP: Gap = { tone: BLOOD, light: 1.6 };

/** How far a pose swings the legs: one way, the other, or not at all. */
function strideOf(pose: CreaturePose): number {
  return pose === "stride-a" ? 1 : pose === "stride-b" ? -1 : 0;
}

/** The shape of a skeleton: stride, breadth, depth, ribs, skull slices and forward lean. */
interface Skeleton {
  readonly k: number;
  readonly wide: number;
  readonly deep: number;
  readonly ribs: number;
  readonly skull: number;
  readonly hunch: number;
}

const MINION: Skeleton = { k: 1, wide: 0.8, deep: 0.8, ribs: 4, skull: 4, hunch: 0.18 };
const HORROR: Skeleton = { k: 1.1, wide: 1.55, deep: 1.1, ribs: 6, skull: 5, hunch: 0.12 };
/** Stooped, half a stride, with one long arm hanging off-centre. */
const SHAMBLER: Skeleton = { k: 0.6, wide: 1.5, deep: 1, ribs: 6, skull: 5, hunch: 0.38 };

/**
 * A skeleton: feet and shins, a pelvis, then each rib a spine knot, a
 * dark gap inside two bone ends, every other one closed by a bone ring,
 * and a skull leaning forward with its eye sockets.
 */
function skeleton(s: Slices, pose: CreaturePose, shape: Skeleton, gap: Gap = DARK_GAP): void {
  const { k, wide, deep, ribs, skull, hunch } = shape;
  const f = strideOf(pose) * k;
  for (let i = 0; i < 2; i += 1) {
    s.push(
      [ellipse(0.3 * f, -0.2 * wide, 0.2, 0.12, 8), ellipse(-0.3 * f, 0.2 * wide, 0.2, 0.12, 8)],
      BONE,
      0.5 + 0.2 * i,
    );
  }
  for (let i = 0; i < 3; i += 1) {
    s.push(
      [
        ellipse(0.2 * f, -0.18 * wide, 0.09, 0.09, 6),
        ellipse(-0.2 * f, 0.18 * wide, 0.09, 0.09, 6),
      ],
      BONE,
      0.6 + 0.08 * i,
    );
  }
  s.push([ellipse(0, 0, 0.3 * wide, 0.3 * wide)], BONE, 0.7);
  for (let i = 0; i < ribs; i += 1) {
    const r = (0.42 + 0.05 * Math.sin((i / ribs) * Math.PI)) * wide;
    const lead = hunch * (i / ribs);
    s.push([ellipse(lead, 0, 0.1, 0.1, 6)], BONE, 0.6 + 0.03 * i);
    s.push([ellipse(lead, 0, r * 0.6 * deep, r * 0.85)], gap.tone, gap.light + 0.04 * i, true);
    s.push(
      [ellipse(lead, -r * 0.8, 0.12, 0.12 * deep, 6), ellipse(lead, r * 0.8, 0.12, 0.12 * deep, 6)],
      BONE,
      0.75 + 0.03 * i,
      true,
    );
    if (i % 2 === 0) {
      s.push([ellipse(lead, 0, r * 0.7 * deep, r)], BONE, 0.8 + 0.02 * i);
    }
  }
  const hx = hunch + 0.1;
  [0.24, 0.3, 0.32, 0.28, 0.2].slice(0, skull).forEach((r, i) => {
    s.push([ellipse(hx, 0, r * 1.1, r)], BONE, 0.75 + 0.06 * i);
    if (i === 1) {
      s.push(
        [
          ellipse(hx + r * 0.7, -r * 0.35, 0.05, 0.05, 6),
          ellipse(hx + r * 0.7, r * 0.35, 0.05, 0.05, 6),
        ],
        STACK_OUTLINE,
        1,
        true,
      );
    }
  });
}

/** The build lift a horror's shoulders stand on. */
const HORROR_SHOULDER = 13;

/**
 * Each horror's cue over the shared build, big enough to read at match
 * zoom: a spike rising off its back, an arm hanging to the ground, or
 * spurs out of its shoulders. The vampiric horror's is its ribcage
 * glowing red, which `horrorGap` gives.
 */
function horrorCue(s: Slices, look: CreatureLook): void {
  switch (look) {
    case "bone-fiend":
      // A bone spike off its back, leaning back over its crown.
      for (let i = 0; i < 14; i += 1) {
        s.at(
          HORROR_SHOULDER - 4 + i,
          [ellipse(-0.4 - 0.03 * i, 0, 0.24 - 0.014 * i, 0.2 - 0.012 * i, 6)],
          BONE,
          0.8 + 0.015 * i,
        );
      }
      return;
    case "shambling-horror":
      // One long arm hanging from a shoulder to the ground, a fist at its end.
      for (let i = 1; i <= HORROR_SHOULDER - 2; i += 1) {
        s.at(i, [ellipse(0.25, 0.78, 0.14, 0.14, 6)], BONE, 0.55 + 0.02 * i);
      }
      s.at(0, [ellipse(0.3, 0.78, 0.22, 0.2, 8)], BONE, 0.6);
      s.at(1, [ellipse(0.3, 0.78, 0.22, 0.2, 8)], BONE, 0.7);
      return;
    case "jagged-horror":
      // Three pairs of long spurs out of its shoulders, stepping down its back.
      for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 3; j += 1) {
          const out = 1.1 - 0.1 * i - 0.17 * j;
          s.at(
            HORROR_SHOULDER - 3 * i + j,
            [-1, 1].map((side) => [
              { x: 0.15 - 0.2 * i, y: side * 0.45 },
              { x: -0.05 - 0.2 * i, y: side * out },
              { x: -0.2 - 0.2 * i, y: side * 0.45 },
            ]),
            BONE,
            0.85 + 0.05 * j,
          );
        }
      }
      return;
    default:
      return;
  }
}

/** A horror's ribcage gaps: dark, or the vampiric horror's red glow. */
function horrorGap(look: CreatureLook): Gap {
  return look === "vampiric-horror" ? BLOOD_GAP : DARK_GAP;
}

/**
 * How much taller than its build each figure stands, and the golem
 * broader too: a bone minion small, a horror about a body, the flesh
 * golem over a body and the broadest of all.
 */
const MINION_TALL = 1.2;
const HORROR_TALL = 1.5;
const GOLEM_TALL = 1.75;
const GOLEM_WIDE = 1.15;

/** How many lifts a flesh golem's body has: the bulkiest figure stands over a horror. */
const GOLEM_BODY_LIFTS = 13;

/**
 * A flesh golem: thick legs, a broad body of flesh rings, every third a
 * dark seam, with a fist hanging at each side, and a small stitched head.
 */
function golem(s: Slices, pose: CreaturePose): void {
  const f = strideOf(pose);
  for (let i = 0; i < 4; i += 1) {
    s.push(
      [ellipse(0.3 * f, -0.4, 0.34, 0.3, 10), ellipse(-0.3 * f, 0.4, 0.34, 0.3, 10)],
      FLESH,
      0.45 + 0.1 * i,
    );
  }
  const last = GOLEM_BODY_LIFTS - 1;
  for (let i = 0; i < GOLEM_BODY_LIFTS; i += 1) {
    const r = 0.8 + 0.12 * Math.sin((i / last) * Math.PI);
    const swing = 0.08 * f * (i / last);
    s.push([ellipse(0, 0, r * 0.8, r)], i % 3 === 2 ? SEAM : FLESH, 0.5 + (0.4 * i) / last);
    s.push(
      [ellipse(-swing, -r * 0.95, 0.24, 0.22, 8), ellipse(swing, r * 0.95, 0.24, 0.22, 8)],
      FLESH,
      0.55 + (0.4 * i) / last,
      true,
    );
  }
  [0.3, 0.36, 0.34, 0.26].forEach((r, i) => {
    s.push([ellipse(0.25, 0, r * 1.05, r)], i === 1 ? SEAM : FLESH, 0.75 + 0.07 * i);
  });
}

/**
 * The slices of minion `look` in `pose`, ground first, in their own
 * colours, at the radius the look is drawn at; `undefined` for a look
 * that is not a minion.
 */
export function minionSlices(
  look: CreatureLook,
  pose: CreaturePose,
): readonly StackSlice<number>[] | undefined {
  switch (look) {
    case "bone-minion": {
      const s = new Slices(MINION_TALL);
      skeleton(s, pose, MINION);
      return s.list;
    }
    case "bone-horror":
    case "bone-fiend":
    case "vampiric-horror":
    case "jagged-horror":
    case "shambling-horror": {
      const s = new Slices(HORROR_TALL);
      skeleton(s, pose, look === "shambling-horror" ? SHAMBLER : HORROR, horrorGap(look));
      horrorCue(s, look);
      return s.list;
    }
    case "flesh-golem": {
      const s = new Slices(GOLEM_TALL, GOLEM_WIDE);
      golem(s, pose);
      return s.list;
    }
    default:
      return undefined;
  }
}
