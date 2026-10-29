import type { RenderableWall } from "./arena-snapshot.js";

/**
 * What the arena's map layer shows (#1353): the grid over the arena's
 * bounds, its edge, and the walls. None of it moves in a match, so the
 * scene draws it once and again only when it changes, not every frame.
 */
export interface MapLayer {
  readonly width: number;
  readonly height: number;
  readonly walls: readonly RenderableWall[];
}

/**
 * Whether `next` must be drawn over what was `drawn`. The walls compare
 * by reference: a match and a Training Ground setup each build their list
 * once, so a new list is a new map.
 */
export function mapLayerChanged(drawn: MapLayer | undefined, next: MapLayer): boolean {
  return drawn?.width !== next.width || drawn.height !== next.height || drawn.walls !== next.walls;
}
