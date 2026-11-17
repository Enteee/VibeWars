import type { MapLighting } from "@vibewars/game-maps/schema";

import type { MapStructure, RenderableWall } from "./arena-snapshot.js";

/**
 * What the arena's map layer shows (#1353): the grid over the arena's
 * bounds, its edge, and the walls. None of it moves in a match, so the
 * scene draws it once and again only when it changes, not every frame.
 */
export interface MapLayer {
  readonly width: number;
  readonly height: number;
  readonly walls: readonly RenderableWall[];
  /** Decks and ramps (ADR-0051): one object per map, as the walls are. */
  readonly structure: MapStructure;
  /** The lighting it is drawn under (ADR-0052). */
  readonly lighting?: MapLighting | undefined;
  /** Whether its light maps cast the shadows (#2988), in place of the fixed deck shadow. */
  readonly lightShadows: boolean;
  /** CSS px per world unit: its lines are 1 CSS px wide at any zoom (#2393). */
  readonly zoom: number;
}

/**
 * Whether `next` must be drawn over what was `drawn`. The walls compare
 * by reference: a match and a Training Ground setup each build their list
 * once, so a new list is a new map.
 */
export function mapLayerChanged(drawn: MapLayer | undefined, next: MapLayer): boolean {
  return (
    drawn?.width !== next.width ||
    drawn.height !== next.height ||
    drawn.walls !== next.walls ||
    drawn.structure !== next.structure ||
    drawn.lighting !== next.lighting ||
    drawn.lightShadows !== next.lightShadows ||
    drawn.zoom !== next.zoom
  );
}

/** A zoom this far from the drawn one, either way, draws the map again at once (#3545). */
export const ZOOM_REDRAW_RATIO = 1.25;
/** A zoom that moved less than this share of itself since last frame has stopped easing. */
export const ZOOM_SETTLED = 1e-4;
/** A stopped zoom this close to the drawn one keeps it: its lines are within 1 % of 1 CSS px. */
export const ZOOM_DRIFT = 1e-2;

/**
 * The zoom the map layer is drawn at (#3545). The camera eases its zoom
 * every frame, and drawing the whole map each of them is the lag of a
 * zoom: the drawn zoom holds until the camera's is 25 % off, or has
 * stopped. The ease only nears its end, so a stopped zoom within
 * `ZOOM_DRIFT` of the drawn one keeps it, or its tail would redraw the
 * map every frame for seconds.
 */
export function layerZoom(
  drawn: number | undefined,
  current: number,
  previous: number | undefined,
): number {
  if (drawn === undefined) {
    return current;
  }
  const ratio = current / drawn;
  if (ratio > ZOOM_REDRAW_RATIO || ratio < 1 / ZOOM_REDRAW_RATIO) {
    return current;
  }
  const settled = previous !== undefined && Math.abs(current - previous) <= ZOOM_SETTLED * current;
  return settled && Math.abs(current - drawn) > ZOOM_DRIFT * current ? current : drawn;
}
