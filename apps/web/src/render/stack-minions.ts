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
const BLOOD_GLOW = 0xc2384a;

/** Slices built one after another, each on a new lift or on the `same` one as the last. */
class Slices {
  readonly list: StackSlice<number>[] = [];
  #lift = -1;

  push(parts: Point[][], tone: number, light: number, same = false, alpha = 1): void {
    if (!same) {
      this.#lift += 1;
    }
    this.list.push({ parts, tone, light, lift: this.#lift, rise: 0, alpha });
  }
}

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
function skeleton(s: Slices, pose: CreaturePose, shape: Skeleton): void {
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
    s.push([ellipse(lead, 0, r * 0.6 * deep, r * 0.85)], BONE_GAP, 0.45 + 0.04 * i, true);
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

/** Each horror's cue over the shared build: a spike, a glow, an arm or spurs. */
function horrorCue(s: Slices, look: CreatureLook): void {
  switch (look) {
    case "bone-fiend":
      // A bone spike leaning off its back.
      for (let i = 0; i < 7; i += 1) {
        s.push(
          [ellipse(-0.35 + 0.05 * i, 0, 0.1 - 0.012 * i, 0.07 - 0.008 * i, 6)],
          BONE,
          0.85 + 0.02 * i,
        );
      }
      return;
    case "vampiric-horror":
      // A blood-red glow over the ribs.
      s.push([ellipse(0.05, 0, 0.3, 0.46)], BLOOD, 1.05, false, 0.9);
      s.push([ellipse(0.05, 0, 0.2, 0.34)], BLOOD_GLOW, 1.1, true, 0.9);
      return;
    case "shambling-horror":
      s.push([ellipse(0.3, 0.45, 0.22, 0.18, 8)], BONE, 0.9);
      s.push([ellipse(0.3, 0.45, 0.2, 0.2, 8)], BONE, 1);
      return;
    case "jagged-horror":
      // Three pairs of spurs at the shoulders, stepping back.
      for (let i = 0; i < 3; i += 1) {
        for (const side of [-1, 1]) {
          s.push(
            [
              [
                { x: 0.1 - 0.12 * i, y: side * 0.5 },
                { x: -0.12 * i, y: side * (0.95 - 0.1 * i) },
                { x: -0.12 - 0.12 * i, y: side * 0.5 },
              ],
            ],
            BONE,
            0.9 + 0.05 * i,
            i > 0 || side > 0,
          );
        }
      }
      return;
    default:
      return;
  }
}

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
  const s = new Slices();
  switch (look) {
    case "bone-minion":
      skeleton(s, pose, MINION);
      return s.list;
    case "bone-horror":
    case "bone-fiend":
    case "vampiric-horror":
    case "jagged-horror":
      skeleton(s, pose, HORROR);
      horrorCue(s, look);
      return s.list;
    case "shambling-horror":
      skeleton(s, pose, SHAMBLER);
      horrorCue(s, look);
      return s.list;
    case "flesh-golem":
      golem(s, pose);
      return s.list;
    default:
      return undefined;
  }
}
