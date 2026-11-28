import { ellipse, type Figure, type Push } from "./sprite-stack.js";

/**
 * The slices the ritualist's, paragon's and dervish's outfits add to the
 * stacked figure (#4180), from the outfit study
 * (`docs/art/profession-outfit-study.svg`): a paragon's tabard over its
 * plate and the spears on its back, a dervish's turban, a ritualist's
 * feathered headdress. `stackSlices` dispatches each kind here.
 */

/**
 * A tabard's stripe of cloth down the plate, front to back, on torso
 * slice `i` of radius `r` at `x`: the study's plate, with the outfit's
 * cloth showing on it.
 */
export function tabardSlices({ push }: Figure, i: number, x: number, r: number): void {
  if (i < 3) {
    return;
  }
  push([ellipse(x, 0, r * 0.68, 0.16, 12)], "cloth", 0.7 + 0.04 * i, true);
}

/** Three spears on the back at torso slice `i`, `x` behind its centre: shafts, then heads. */
export function spearsSlices({ push }: Figure, i: number, x: number): void {
  push(
    [
      ellipse(x, -0.16, 0.05, 0.05, 6),
      ellipse(x, 0, 0.05, 0.05, 6),
      ellipse(x, 0.16, 0.05, 0.05, 6),
    ],
    i === 6 ? "metal" : "leather",
    0.6 + 0.06 * i,
    true,
  );
}

/** A wound turban round `cx`, the face under its front, a gold jewel on top. */
export function turbanSlices(push: Push, cx: number): void {
  [0.34, 0.42, 0.46, 0.46, 0.4, 0.3].forEach((r, i) => {
    push([ellipse(cx, 0, r * 1.05, r)], "cloth", 0.7 + 0.07 * i);
    if (i === 3) {
      push([ellipse(cx + 0.06, 0, r * 0.8, r * 0.7)], "skin", 0.95, true);
    }
  });
  push([ellipse(cx, 0, 0.12, 0.12, 8)], "gold", 1.05);
}

/** A bare head round `cx`, a fan of feathers up and back in the crest's colour, bound in gold. */
export function headdressSlices(push: Push, cx: number): void {
  [0.26, 0.3, 0.32, 0.32, 0.28].forEach((r, i) => {
    push([ellipse(cx, 0, r * 1.05, r)], "skin", 0.7 + 0.07 * i);
  });
  push([ellipse(cx - 0.06, 0, 0.3, 0.3, 12)], "hair", 0.95);
  for (const y of [-0.5, -0.25, 0, 0.25, 0.5]) {
    push([ellipse(cx - 0.12, y * 0.7, 0.07, 0.15, 6)], "crest", 1.05, true);
  }
  push([ellipse(cx - 0.12, 0, 0.2, 0.3, 10)], "gold", 1.08);
}
