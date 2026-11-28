import { ellipse, type Figure, type Push } from "./sprite-stack.js";

/**
 * The slices the necromancer's, mesmer's and assassin's outfits add to the
 * stacked figure (#4179), from the outfit study
 * (`docs/art/profession-outfit-study.svg`): an assassin's wrap and the
 * blades on its back, a mesmer's mantle and plumed hat, a necromancer's
 * bone spikes, and the cowl both of the others wear. `stackSlices`
 * dispatches each kind here.
 */

/** A wrap's skirt: short and close, so that the legs move free. */
export function wrapSkirtRadii(): readonly number[] {
  return [0.54, 0.54, 0.52, 0.52];
}

/** Two blades crossed on the back, at torso slice `i`, `x` behind its centre. */
export function bladesSlices({ push }: Figure, i: number, x: number): void {
  if (i < 3) {
    return;
  }
  const d = (i - 3) * 0.14;
  push(
    [ellipse(x, -0.2 + d, 0.05, 0.05, 6), ellipse(x, 0.2 - d, 0.05, 0.05, 6)],
    "metal",
    0.8 + 0.05 * i,
    true,
  );
}

/** A cloth mantle over both shoulders, narrowing as it rises. */
export function mantleSlices({ push, motion }: Figure): void {
  for (let i = 0; i < 2; i += 1) {
    push(
      [ellipse(-0.04 + 0.25 * motion.lean, 0, 0.34 - 0.04 * i, 0.82 - 0.06 * i, 16)],
      "cloth",
      0.85 + 0.15 * i,
    );
  }
}

/** Bone shoulder guards, a spike rising from each. */
export function spikesSlices({ push, motion }: Figure): void {
  const x = 0.25 * motion.lean;
  for (let i = 0; i < 2; i += 1) {
    push(
      [ellipse(x, -0.6, 0.24, 0.2, 10), ellipse(x, 0.6, 0.24, 0.2, 10)],
      "bone",
      0.85 + 0.15 * i,
    );
  }
  push(
    [ellipse(x - 0.04, -0.74, 0.07, 0.07, 6), ellipse(x - 0.04, 0.74, 0.07, 0.07, 6)],
    "bone",
    1.05,
    true,
  );
}

/** A deep cowl round `cx`: its opening is dark, the face hidden in it. */
export function cowlSlices(push: Push, cx: number): void {
  [0.32, 0.38, 0.42, 0.42, 0.38, 0.3].forEach((r, i) => {
    push([ellipse(cx, 0, r * 1.05, r)], "cloth", 0.7 + 0.07 * i);
    if (i === 2 || i === 3) {
      push([ellipse(cx + r * 0.62, 0, 0.14, 0.18, 10)], "visor", 1, true);
    }
  });
}

/** A wide brim round `cx`, the face under it, a low crown and a plume in the crest's colour. */
export function hatSlices(push: Push, cx: number): void {
  push([ellipse(cx, 0, 0.5, 0.5, 18)], "cloth", 0.8);
  push([ellipse(cx, 0, 0.34, 0.34, 14)], "skin", 0.85, true);
  [0.3, 0.3, 0.28, 0.26, 0.22].forEach((r, i) => {
    push([ellipse(cx, 0, r * 1.05, r)], "cloth", 0.7 + 0.07 * i);
  });
  push([ellipse(cx - 0.12, 0.2, 0.22, 0.07, 8, 0.6)], "crest", 1.05);
}
