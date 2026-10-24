/**
 * The game's shared distances, in world units (the same units as map
 * geometry).
 *
 * Ranges are this project's own tuning: the source corpus does not
 * publish numeric ranges. The area radii are the reference's "adjacent",
 * "nearby" and "in the area", rescaled the way `equipment/weapons.ts`
 * rescales weapon reach, with "adjacent" pinned to melee range so a
 * swing and a splash agree on who is next to you.
 */

/** Touch/melee-ish range: must be adjacent. */
export const RANGE_MELEE = 40;
/** Normal spell range. */
export const RANGE_SPELL = 420;

/** "Adjacent": everyone within melee reach of the origin. */
export const AREA_ADJACENT = RANGE_MELEE;
/** "Nearby". */
export const AREA_NEARBY = 81;
/** "In the area". */
export const AREA_IN_THE_AREA = 109;
