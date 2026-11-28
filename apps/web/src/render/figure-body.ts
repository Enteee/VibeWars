import type { Build, FigureBody, Height } from "@vibewars/game-protocol";

import type { Point } from "./weapon-mark-geometry.js";

/**
 * A figure's height and build on its slices (#4176), as the body study
 * (`docs/art/figure-body-study.md`) settled them. Height stretches the
 * stack's lift, never its width; build widens each region of the body
 * and leans its upper body forward along the heading.
 */

/** How much higher than average each height stacks its slices. */
export const HEIGHT_SCALE: Record<Height, number> = { short: 0.92, average: 1, tall: 1.08 };

/**
 * Each build's width factor per region, and its `lean`: how far forward,
 * in body radii, the shoulders stand. The average build is the figure
 * the outfits are drawn as, so a build leans by how much more than it.
 */
export const BUILD_SHAPES: Record<
  Build,
  {
    readonly shoulder: number;
    readonly chest: number;
    readonly waist: number;
    readonly limb: number;
    readonly lean: number;
  }
> = {
  lean: { shoulder: 0.84, chest: 0.8, waist: 0.76, limb: 0.82, lean: 0 },
  average: { shoulder: 1, chest: 1, waist: 1, limb: 1, lean: 0.04 },
  heavy: { shoulder: 1.24, chest: 1.22, waist: 1.24, limb: 1.2, lean: 0.12 },
};

/** The body a figure has when nobody picked one: a creature's, say. */
export const AVERAGE_BODY: FigureBody = { height: "average", build: "average" };

/**
 * Where on the body a slice is: legs and boots, the hips and skirt, the
 * torso, the arms, the shoulders, or the head.
 */
export type BodyRegion = "legs" | "waist" | "torso" | "arms" | "shoulders" | "head";

/**
 * The parts of a slice in `region`, shaped to `build`: widened sideways
 * (`y`) by the region's factor, which also widens a stance and sets the
 * arms out, and moved forward (`x`) by the region's share of the lean.
 */
export function shapeParts(parts: Point[][], region: BodyRegion, build: Build): Point[][] {
  const shape = BUILD_SHAPES[build];
  const lean = shape.lean - BUILD_SHAPES.average.lean;
  const [wide, forward] = ((): readonly [number, number] => {
    switch (region) {
      case "legs":
        return [shape.limb, 0];
      case "waist":
        return [shape.waist, 0];
      case "torso":
        return [shape.chest, 0.6 * lean];
      case "arms":
        return [shape.shoulder, 0.8 * lean];
      case "shoulders":
        return [shape.shoulder, lean];
      case "head":
        return [1, 1.3 * lean];
    }
  })();
  return parts.map((part) => part.map((p) => ({ x: p.x + forward, y: p.y * wide })));
}
