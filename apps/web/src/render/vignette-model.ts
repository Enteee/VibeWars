import type { Box } from "./layer-surfaces.js";

/**
 * The gothic look's vignette (#4057): the view darkens towards its
 * corners, as in the mock (`docs/art/spikes/3977-sprite-stacking`).
 * `alpha` is the darkening at a corner; `clear` is how far from the centre,
 * as a share of the way to a corner, nothing darkens: the centre third.
 */
export const VIGNETTE = { alpha: 0.6, clear: 1 / 3 } as const;

/** The texture's side in pixels: the ramp is smooth, so stretched it shows no steps. */
export const TEXTURE_SIZE = 128;

/**
 * How dark the vignette is at `(x, y)` of a view `width` by `height`: 0 in
 * the centre third, rising smoothly to `VIGNETTE.alpha` at the corners.
 * The view's sides are scaled to one, so a wide view's vignette is as wide.
 */
export function vignetteAlpha(x: number, y: number, width: number, height: number): number {
  const across = (2 * x) / width - 1;
  const down = (2 * y) / height - 1;
  return alphaOut(Math.hypot(across, down) / Math.SQRT2);
}

/** How dark the vignette is `out` of the way from the centre to a corner, 0 to 1. */
export function alphaOut(out: number): number {
  const ramp = Math.min(1, Math.max(0, (out - VIGNETTE.clear) / (1 - VIGNETTE.clear)));
  return VIGNETTE.alpha * ramp * ramp * (3 - 2 * ramp);
}

/** A rectangle of the vignette's texture, in its pixels. */
export interface TextureCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The part of the texture stretched over `view` that falls on `box`, both
 * in world units, so a deck pass shades each point as the full view does;
 * undefined when the box is out of view.
 */
export function deckCrop(box: Box, view: Box): TextureCrop | undefined {
  const left = Math.max(box.left, view.left);
  const right = Math.min(box.right, view.right);
  const top = Math.max(box.top, view.top);
  const bottom = Math.min(box.bottom, view.bottom);
  if (left >= right || top >= bottom) {
    return undefined;
  }
  const across = TEXTURE_SIZE / (view.right - view.left);
  const down = TEXTURE_SIZE / (view.bottom - view.top);
  return {
    x: (left - view.left) * across,
    y: (top - view.top) * down,
    width: (right - left) * across,
    height: (bottom - top) * down,
  };
}
