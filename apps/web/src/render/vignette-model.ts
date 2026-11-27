import type { Box } from "./layer-surfaces.js";

/**
 * The gothic look's vignette (#4057): the view darkens towards its
 * corners, as in the mock (`docs/art/spikes/3977-sprite-stacking`).
 * `alpha` is the darkening at a corner; `clear` is how far from the centre,
 * as a share of the way to a corner, nothing darkens: the centre third.
 */
export const VIGNETTE = { alpha: 0.6, clear: 1 / 3 } as const;

/**
 * How many cells a side the vignette is drawn in (#4130). Each cell shades
 * linearly between its corners, which keeps it within 1 % of
 * `vignetteAlpha`, so it shows no steps.
 */
export const VIGNETTE_GRID = 16;

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

/** One cell of the vignette, in world units, and how dark each of its corners is. */
export interface VignetteCell {
  readonly box: Box;
  readonly topLeft: number;
  readonly topRight: number;
  readonly bottomLeft: number;
  readonly bottomRight: number;
}

/**
 * The cells of the vignette over `view` that fall on `clip`, both in
 * world units (#4130): `VIGNETTE_GRID` a side over the view, each cut to
 * `clip` and shaded as the whole cell would be there, so a deck pass shades
 * each point as the ground pass does. A cell dark at none of its corners is
 * left out: the clear centre is an ellipse, so all of such a cell is clear.
 * On a software renderer every pixel drawn costs, and most of the view is
 * not darkened.
 */
export function vignetteCells(view: Box, clip: Box = view): VignetteCell[] {
  const width = view.right - view.left;
  const height = view.bottom - view.top;
  const step = { x: width / VIGNETTE_GRID, y: height / VIGNETTE_GRID };
  const cells: VignetteCell[] = [];
  for (let row = 0; row < VIGNETTE_GRID; row += 1) {
    for (let column = 0; column < VIGNETTE_GRID; column += 1) {
      const cell = {
        left: view.left + column * step.x,
        top: view.top + row * step.y,
        right: view.left + (column + 1) * step.x,
        bottom: view.top + (row + 1) * step.y,
      };
      const box = {
        left: Math.max(cell.left, clip.left),
        top: Math.max(cell.top, clip.top),
        right: Math.min(cell.right, clip.right),
        bottom: Math.min(cell.bottom, clip.bottom),
      };
      if (box.left >= box.right || box.top >= box.bottom) {
        continue;
      }
      const at = (x: number, y: number) =>
        vignetteAlpha(x - view.left, y - view.top, width, height);
      const corners = [
        at(cell.left, cell.top),
        at(cell.right, cell.top),
        at(cell.left, cell.bottom),
        at(cell.right, cell.bottom),
      ] as const;
      if (corners.every((alpha) => alpha === 0)) {
        continue;
      }
      const [topLeft, topRight, bottomLeft, bottomRight] = corners;
      // The cell's shade at `(x, y)` within it, as drawn: between its corners.
      const shade = (x: number, y: number) => {
        const across = (x - cell.left) / step.x;
        const down = (y - cell.top) / step.y;
        const top = topLeft + (topRight - topLeft) * across;
        const bottom = bottomLeft + (bottomRight - bottomLeft) * across;
        return top + (bottom - top) * down;
      };
      cells.push({
        box,
        topLeft: shade(box.left, box.top),
        topRight: shade(box.right, box.top),
        bottomLeft: shade(box.left, box.bottom),
        bottomRight: shade(box.right, box.bottom),
      });
    }
  }
  return cells;
}
