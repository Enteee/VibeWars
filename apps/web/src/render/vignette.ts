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

/**
 * How dark the vignette is at `(x, y)` of a view `width` by `height`: 0 in
 * the centre third, rising smoothly to `VIGNETTE.alpha` at the corners.
 * The view's sides are scaled to one, so a wide view's vignette is as wide.
 */
export function vignetteAlpha(x: number, y: number, width: number, height: number): number {
  const across = (2 * x) / width - 1;
  const down = (2 * y) / height - 1;
  const out = Math.hypot(across, down) / Math.SQRT2;
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
  const pixels = canvas.context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const alpha = vignetteAlpha(x + 0.5, y + 0.5, TEXTURE_SIZE, TEXTURE_SIZE);
      // The colour is black: only the alpha channel is written.
      pixels.data[(y * TEXTURE_SIZE + x) * 4 + 3] = Math.round(alpha * 0xff);
    }
  }
  canvas.context.putImageData(pixels, 0, 0);
  canvas.refresh();
}
