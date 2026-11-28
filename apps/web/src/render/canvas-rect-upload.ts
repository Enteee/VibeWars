import Phaser from "phaser";

/**
 * Upload only `x, y, width, height` of a canvas texture's canvas to its
 * WebGL texture (#4271), where `texture.refresh()` would upload all of it.
 * Phaser 4.2 has no partial upload, so this does what its own
 * `WebGLTextureWrapper._processTexture` does with `texSubImage2D`: it binds
 * through Phaser's texture units and sets the same unpack flags through
 * Phaser's GL state, so Phaser's bookkeeping of both stays true. It leaves
 * the source's dirty flag alone, or Phaser would upload everything anyway.
 * Relies on Phaser 4.2.1's renderer internals; false without WebGL or the
 * texture's GL texture, and then the caller refreshes the whole of it.
 */
export function uploadCanvasRect(
  renderer: Phaser.Renderer.Canvas.CanvasRenderer | Phaser.Renderer.WebGL.WebGLRenderer,
  texture: Phaser.Textures.CanvasTexture,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) {
    return false;
  }
  const source = texture.source[0];
  const wrapper = source?.glTexture;
  if (source === undefined || wrapper === undefined || wrapper === null) {
    return false;
  }
  const gl = renderer.gl;
  const pixels = texture.context.getImageData(x, y, width, height);
  renderer.glTextureUnits.bind(wrapper, 0);
  renderer.glWrapper.updateTexturing({
    texturing: { flipY: wrapper.flipY, premultiplyAlpha: wrapper.pma },
  });
  // A flipped upload counts its rows from the canvas's bottom.
  const top = wrapper.flipY ? texture.height - y - height : y;
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x, top, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  // Rebinding with the flag set regenerates its mipmaps, as an upload does.
  wrapper.needsMipmapRegeneration = true;
  renderer.glTextureUnits.bind(wrapper, 0, true);
  return true;
}
