import type { MapData } from "./schema.js";

/** How big an arena plays, for the lobby's picker (#444). */
export type SizeClass = "small" | "medium" | "large";

/** Up to this, an arena is small: a few seconds across. */
const SMALL_UP_TO = 3200;
/** Up to this, medium; beyond it, large. */
const MEDIUM_UP_TO = 4800;

/**
 * The arena's size class, from its longest walkable straight line: the
 * longer side of its bounds, which every arena can be walked along end to
 * end. Every arena today is small, up to the 3200-unit Long Hall
 * (#2547); the medium and large ones are #2544's to come.
 */
export function sizeClass(map: Pick<MapData, "width" | "height">): SizeClass {
  const longest = Math.max(map.width, map.height);
  return longest <= SMALL_UP_TO ? "small" : longest <= MEDIUM_UP_TO ? "medium" : "large";
}
