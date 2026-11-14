/** An arc, in radians, clockwise from `from` to `to`. */
export interface Arc {
  readonly from: number;
  readonly to: number;
}

/** The arcs of a dashed circle of `radius`: `dash` long, `gap` apart, as near as whole. */
export function dashedCircle(radius: number, dash: number, gap: number): Arc[] {
  const count = Math.max(1, Math.round((2 * Math.PI * radius) / (dash + gap)));
  const step = (2 * Math.PI) / count;
  const drawn = (step * dash) / (dash + gap);
  return Array.from({ length: count }, (_, k) => ({ from: k * step, to: k * step + drawn }));
}
