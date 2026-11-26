import { expect, type Locator } from "@playwright/test";

/** World units to screen, through the arena's follow camera as it stands. */
export interface Projection {
  /** CSS px per world unit. */
  readonly zoom: number;
  /** A world point on the canvas, canvas px: for `click({ position })`. */
  onCanvas(world: { readonly x: number; readonly y: number }): { x: number; y: number };
  /** A world point on the page, page px: for `page.mouse` and clips. */
  onPage(world: { readonly x: number; readonly y: number }): { x: number; y: number };
}

/**
 * The follow camera (#440) as the stage's test hooks describe it:
 * `data-camera` is the world point at the canvas centre, `data-zoom` its
 * CSS px per world unit: the window's, not the canvas's, in the Training
 * Ground (#709). Read once; a camera that moves after makes it stale.
 */
export async function projection(stage: Locator, canvas: Locator): Promise<Projection> {
  await expect(stage).toHaveAttribute("data-camera", /^-?\d+,-?\d+$/);
  const [cx = 0, cy = 0] = ((await stage.getAttribute("data-camera")) ?? "").split(",").map(Number);
  await expect(stage).toHaveAttribute("data-zoom", /^\d+\.\d+$/);
  const zoom = Number(await stage.getAttribute("data-zoom"));
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("the arena canvas has no box");
  }
  const onCanvas = (world: { readonly x: number; readonly y: number }) => ({
    x: box.width / 2 + (world.x - cx) * zoom,
    y: box.height / 2 + (world.y - cy) * zoom,
  });
  return {
    zoom,
    onCanvas,
    onPage(world) {
      const at = onCanvas(world);
      return { x: box.x + at.x, y: box.y + at.y };
    },
  };
}
