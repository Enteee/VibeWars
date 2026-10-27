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
/**
 * "Within earshot", where a shout reaches (#524). GW1's earshot is about
 * 1,010 units against 1,250 for cast range; `RANGE_SPELL` is 420, so the
 * same ratio gives ~340, the ~0.34 that "nearby" and "in the area" are
 * already rescaled by.
 */
export const AREA_EARSHOT = 350;
/**
 * Spirit range, where Soul Reaping hears a death (#530). GW1's is about
 * 2,500 units, rescaled by the same ~0.34 as `AREA_EARSHOT` and
 * `RANGE_SPELL`.
 */
export const RANGE_SPIRIT = 850;
/**
 * Compass range, beyond which a maintained enchantment's bearer is lost
 * to its caster (#839). GW1's is about 5,000 units, rescaled by the same
 * ~0.34 as `RANGE_SPIRIT`.
 */
export const RANGE_COMPASS = 1700;
