import { closestPointOnSegment, type Segment } from "../geometry.js";
import { add, distance, normalize, scale, sub, type Vec2 } from "../vec2.js";

/**
 * Breakable walls (#3031): a wall with health. Anyone clicks it, as
 * `breakable-<id>`, and strikes it with blows and with damage skills
 * aimed at it; it takes the damage and nothing else, with no armor.
 * At 0 it crumbles and is gone for the match. It never mends, and
 * belongs to nobody.
 *
 * Pure: the simulation says who struck it how hard; this keeps count.
 */

/** A breakable wall as the map lays it out. */
export interface BreakableField {
  readonly id: string;
  /** The wall it is while it stands. */
  readonly segments: readonly Segment[];
  /** The layer it stands on (ADR-0051). */
  readonly layer: number;
  /** Its health as the match starts, and the most it has. */
  readonly maxHealth: number;
}

/** One breakable wall as it stands. */
export interface BreakableState {
  /** 0 once it has crumbled. */
  readonly health: number;
}

/** A breakable wall on the map, and how it stands. */
export interface Breakable extends BreakableField, BreakableState {}

/** Every breakable wall starts whole. */
export function initialBreakables(fields: readonly BreakableField[]): Breakable[] {
  return fields.map((field) => ({ ...field, health: field.maxHealth }));
}

/** Whether `breakable` still stands. */
export function standing(breakable: BreakableState): boolean {
  return breakable.health > 0;
}

/** `breakable` after `amount` damage; a crumbled one stays down. */
export function damageBreakable(breakable: Breakable, amount: number): Breakable {
  if (!standing(breakable) || amount <= 0) {
    return breakable;
  }
  return { ...breakable, health: Math.max(0, breakable.health - Math.round(amount)) };
}

/**
 * Where a blow or a shot from `from` meets `breakable`: its wall's
 * nearest point, `standoff` out toward `from`, so the wall itself
 * never stands in the way of what is aimed at it, and a body can walk
 * to it.
 */
export function strikePointOf(breakable: BreakableField, from: Vec2, standoff: number): Vec2 {
  let best = breakable.segments[0]?.a ?? from;
  let bestDistance = Infinity;
  for (const segment of breakable.segments) {
    const point = closestPointOnSegment(from, segment);
    const far = distance(from, point);
    if (far < bestDistance) {
      best = point;
      bestDistance = far;
    }
  }
  return bestDistance <= standoff ? from : add(best, scale(normalize(sub(from, best)), standoff));
}

const PREFIX = "breakable-";

/** The target id a player clicks to strike the breakable wall `id`. */
export function breakableTargetId(id: string): string {
  return `${PREFIX}${id}`;
}

/** The breakable wall id `targetId` names, or `undefined` if it names none. */
export function breakableIdOf(targetId: string): string | undefined {
  return targetId.startsWith(PREFIX) ? targetId.slice(PREFIX.length) : undefined;
}
