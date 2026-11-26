/**
 * Text that keeps its size on screen whatever the camera's zoom (#456).
 *
 * The camera scales every game object by its zoom, so an 11 px world-space
 * name came out about 7 px at `Default` in a 1280×720 window. Names, the
 * status `+N` and floating combat text instead counter-scale by `1 / zoom`,
 * as GW1's do; the gaps that place them are screen px too, turned into
 * world units here. Bodies, bars, icons and rings keep scaling with the
 * world. No Phaser, so the maths is tested in Node.
 *
 * No `devicePixelRatio` text resolution: the canvas is CSS px (RESIZE), so
 * a text texture at its design size already maps one texel to one canvas
 * pixel.
 */

/** `px` screen pixels in world units at `zoom`, CSS px per world unit. */
export function screenPx(px: number, zoom: number): number {
  return px / zoom;
}

/** What `screenSized` needs of a Phaser object: its scale. */
export interface Scalable {
  readonly scaleX: number;
  setScale(scale: number): unknown;
}

/**
 * Scale `object` by `1 / zoom`, so the camera's zoom cancels out and it
 * draws at its design size. Only on a change: a steady frame sets nothing.
 */
export function screenSized(object: Scalable, zoom: number): void {
  const scale = 1 / zoom;
  if (object.scaleX !== scale) {
    object.setScale(scale);
  }
}
