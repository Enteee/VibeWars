import { vec2, type Vec2 } from "@vibewars/game-core";

/**
 * `spawn` moved along the line to the map's centre until it is at least
 * `half` from every edge (#3221), so the default view is all playfield;
 * the centre itself on a map too small for that.
 */
export function inwardStart(
  spawn: Vec2,
  size: { readonly width: number; readonly height: number },
  half: Vec2,
): Vec2 {
  const centre = vec2(size.width / 2, size.height / 2);
  // The least share of the way to the centre that clears one axis' edges.
  const share = (from: number, mid: number, keep: number, extent: number): number => {
    if (keep > mid) {
      return 1;
    }
    if (from < keep) {
      return (keep - from) / (mid - from);
    }
    if (from > extent - keep) {
      return (from - (extent - keep)) / (from - mid);
    }
    return 0;
  };
  const along = Math.min(
    1,
    Math.max(
      share(spawn.x, centre.x, half.x, size.width),
      share(spawn.y, centre.y, half.y, size.height),
    ),
  );
  return vec2(spawn.x + (centre.x - spawn.x) * along, spawn.y + (centre.y - spawn.y) * along);
}
