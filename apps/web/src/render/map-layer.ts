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

/** A zoom this far from the drawn one, either way, draws the map again mid-ease (#3545). */
export const ZOOM_REDRAW_RATIO = 1.25;

/**
 * A zoom within this share of the drawn one is the same zoom to the map's
 * lines (#3545). The ease toward a step is exponential, so it creeps on
 * for seconds after it looks settled: without this each creep redrew it.
 */
export const ZOOM_SAME_SHARE = 0.01;

/** A zoom that moved no more than this share in a frame has settled (#3545). */
export const ZOOM_SETTLED_SHARE = 1e-3;

/**
 * The zoom the map layer is drawn at (#3545): `current`, the camera's, once
 * nothing is drawn yet, once it has drifted `ZOOM_REDRAW_RATIO` from
 * `drawn`, or once it settles (it moved under `ZOOM_SETTLED_SHARE` since
 * `previous`, the last frame's). Otherwise `drawn`: redrawing the whole
 * map on every frame of a zoom's ease was the lag, and lines up to 25 %
 * off their 1 CSS px for a third of a second do not show.
 */
export function layerZoom(
  drawn: number | undefined,
  current: number,
  previous: number | undefined,
): number {
  if (drawn === undefined) {
    return current;
  }
  if (Math.abs(current - drawn) <= ZOOM_SAME_SHARE * current) {
    return drawn;
  }
  const ratio = current / drawn;
  if (ratio > ZOOM_REDRAW_RATIO || ratio < 1 / ZOOM_REDRAW_RATIO) {
    return current;
  }
  if (previous !== undefined && Math.abs(current - previous) <= ZOOM_SETTLED_SHARE * current) {
    return current;
  }
  return drawn;
}
