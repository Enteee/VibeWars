/** The signals of docs/art/visual-style.md §1, which no biome tone may sit near. */
export const SIGNALS = [
  0x59c2ff, 0xff7b72, 0xff8a3d, 0xffd23d, 0x7fbf2a, 0xc8f05a, 0x3f9fe8, 0x9fdcff, 0x2f8a3c,
  0x76c96f, 0xa77bff,
];

/** A hand's width on the colour wheel: a quarter of its radius. */
export const HAND = 0.25;

/** Where `colour` sits on the colour wheel: its hue the angle, its chroma (0 to 1) the radius. */
function onWheel(colour: number): { readonly x: number; readonly y: number } {
  const r = ((colour >> 16) & 0xff) / 255;
  const g = ((colour >> 8) & 0xff) / 255;
  const b = (colour & 0xff) / 255;
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma === 0) {
    return { x: 0, y: 0 };
  }
  const sector =
    max === r
      ? ((g - b) / chroma + 6) % 6
      : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  const hue = (sector / 6) * Math.PI * 2;
  return { x: Math.cos(hue) * chroma, y: Math.sin(hue) * chroma };
}

/** How far apart two colours sit on the colour wheel. */
export function wheelDistance(a: number, b: number): number {
  const from = onWheel(a);
  const to = onWheel(b);
  return Math.hypot(from.x - to.x, from.y - to.y);
}
