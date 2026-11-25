import type Phaser from "phaser";

import type { Vec2 } from "@vibewars/game-core";

import { renderOrder } from "./render-order.js";

/**
 * The gothic look's vignette (#4057): the view darkens towards its
 * corners, as in the mock (`docs/art/spikes/3977-sprite-stacking`).
 * `alpha` is the darkening at a corner; `clear` is how far from the centre,
 * as a share of the way to a corner, nothing darkens: the centre third.
 */
export const VIGNETTE = { alpha: 0.6, clear: 1 / 3 } as const;

const TEXTURE = "vignette";
/** The texture's side in pixels: the ramp is smooth, so stretched it shows no steps. */
const TEXTURE_SIZE = 128;
/** Enough stops that the smooth ramp shows no bands. */
const GRADIENT_STOPS = 24;

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
function alphaOut(out: number): number {
  const ramp = Math.min(1, Math.max(0, (out - VIGNETTE.clear) / (1 - VIGNETTE.clear)));
  return VIGNETTE.alpha * ramp * ramp * (3 - 2 * ramp);
}

/**
 * The vignette over the world and under every gameplay layer (#4057): one
 * texture, painted once, stretched over the view. It follows the camera,
 * so it is placed in world units wherever the camera points.
 */
export class Vignette {
  private readonly image: Phaser.GameObjects.Image;

  public constructor(scene: Phaser.Scene) {
    paintTexture(scene.textures);
    this.image = scene.add
      .image(0, 0, TEXTURE)
      .setOrigin(0.5)
      .setDepth(renderOrder({ kind: "vignette" }));
  }

  /** Cover the view centred on `centre`, `size` CSS px at `zoom` CSS px per world unit. */
  public place(centre: Vec2, zoom: number, size: { width: number; height: number }): void {
    this.image
      .setPosition(centre.x, centre.y)
      .setDisplaySize(size.width / zoom, size.height / zoom);
  }

  public destroy(): void {
    this.image.destroy();
  }
}

function paintTexture(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(TEXTURE)) {
    return;
  }
  const canvas = textures.createCanvas(TEXTURE, TEXTURE_SIZE, TEXTURE_SIZE);
  if (canvas === null) {
    throw new Error("vignette: could not create its texture");
  }
  // A circle to the corners of a square: stretched over the view, the ramp `vignetteAlpha` draws.
  const middle = TEXTURE_SIZE / 2;
  const gradient = canvas.context.createRadialGradient(
    middle,
    middle,
    0,
    middle,
    middle,
    middle * Math.SQRT2,
  );
  for (let stop = 0; stop <= GRADIENT_STOPS; stop += 1) {
    const out = stop / GRADIENT_STOPS;
    gradient.addColorStop(out, `rgba(0,0,0,${String(alphaOut(out))})`);
  }
  canvas.context.fillStyle = gradient;
  canvas.context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  canvas.refresh();
}
