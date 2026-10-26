import type { MapData } from "./schema.js";

/** How big an arena plays, for the lobby's picker (#444). */
export type SizeClass = "small" | "medium" | "large";

/** Up to this, an arena is small: a few seconds across. */
const SMALL_UP_TO = 1200;
/** Up to this, medium; beyond it, large. */
const MEDIUM_UP_TO = 2400;

/**
 * The arena's size class, from its longest walkable straight line: the
 * longer side of its bounds, which every arena can be walked along end to
 * end. Today's four are small; a 3200-unit hall is large.
 */
export function sizeClass(map: Pick<MapData, "width" | "height">): SizeClass {
  const longest = Math.max(map.width, map.height);
  return longest <= SMALL_UP_TO ? "small" : longest <= MEDIUM_UP_TO ? "medium" : "large";
}
