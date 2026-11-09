import { pointInPolygon, segment, type Polygon, type Segment } from "../geometry.js";
import { wieldsFor, type WeaponId } from "../equipment/weapons.js";
import { HEIGHT_DAMAGE_PERCENT, HEIGHT_RANGE_PERCENT } from "../match-rules.js";
import { rampUphill } from "../pathing.js";
import { add, distance, dot, scale, type Vec2 } from "../vec2.js";

/**
 * The rule table of ADR-0051, as plain questions about a position and a
 * layer. `game-core`'s one home for them: a body's floors are a bit mask,
 * so asking whether two bodies share one allocates nothing.
 */

/** A deck's footprint on the layer it belongs to. */
export interface DeckFootprint {
  readonly layer: number;
  readonly footprint: Polygon;
}

/** A ramp's area and the two layers it connects. */
export interface FloorTransition {
  readonly from: number;
  readonly to: number;
  readonly area: Polygon;
}

/** The one floor of `layer`: what an area fixed to a layer reaches. */
export function floorOf(layer: number): number {
  return 1 << layer;
}

/**
 * The floors a body at `position` on `layer` is on: its layer's, and,
 * inside a ramp, both of the layers that ramp connects.
 */
export function floorsAt(
  position: Vec2,
  layer: number,
  transitions: readonly FloorTransition[],
): number {
  let floors = floorOf(layer);
  for (const transition of transitions) {
    if (pointInPolygon(position, transition.area)) {
      floors |= floorOf(transition.from) | floorOf(transition.to);
    }
  }
  return floors;
}

/** Whether two sets of floors have one in common. */
export function sharesFloor(a: number, b: number): boolean {
  return (a & b) !== 0;
}

/** A body as an objective reads it: where it is, and on which floors. */
export interface BodyOnFloors {
  readonly position: Vec2;
  readonly floors: number;
}

/**
 * Whether `body` is at an objective at `point` on `layer`: within `reach`
 * and on that layer, or in a ramp connecting to it. A body on the ground
 * under a deck is not at what stands on the deck, and vice versa.
 */
export function atObjective(
  point: Vec2,
  layer: number,
  body: BodyOnFloors,
  reach: number,
): boolean {
  return sharesFloor(body.floors, floorOf(layer)) && distance(point, body.position) <= reach;
}

/**
 * Whether a deck stands between shooter and target (ADR-0051): the
 * shooter on it with the target strictly below under its footprint, or
 * the shooter strictly below under its footprint with the target on it.
 * Read on the bodies' layers alone: a ramp's double floor is for melee
 * and areas.
 */
export function deckBlocksSight(
  decks: readonly DeckFootprint[],
  from: Vec2,
  fromLayer: number,
  to: Vec2,
  toLayer: number,
): boolean {
  if (fromLayer === toLayer) {
    return false;
  }
  for (const deck of decks) {
    if (
      (deck.layer === fromLayer && toLayer < fromLayer && pointInPolygon(to, deck.footprint)) ||
      (deck.layer === toLayer && fromLayer < toLayer && pointInPolygon(from, deck.footprint))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Which way a shot goes: 1 aimed down, -1 aimed up, 0 level. Two layers
 * of difference count as one, and floors in common are no difference.
 */
export function heightStep(
  fromFloors: number,
  fromLayer: number,
  toFloors: number,
  toLayer: number,
): -1 | 0 | 1 {
  if (sharesFloor(fromFloors, toFloors)) {
    return 0;
  }
  return fromLayer > toLayer ? 1 : -1;
}

/** Whether `weaponId` is one height changes: a bow or a spear. */
export function feelsHeight(weaponId: WeaponId): boolean {
  return wieldsFor(weaponId, "bow") || wieldsFor(weaponId, "spear");
}

/** `range`, stretched or cut by a shot's height step. */
export function heightRange(range: number, step: number): number {
  return (range * (100 + step * HEIGHT_RANGE_PERCENT)) / 100;
}

/** What a shot's height step multiplies its non-critical damage by. */
export function heightDamageMultiplier(step: number): number {
  return (100 + step * HEIGHT_DAMAGE_PERCENT) / 100;
}

/** From each ramp towards the nearest edge of a deck it climbs to, in `transitions`' order. */
export function uphillDirections(
  transitions: readonly FloorTransition[],
  decks: readonly DeckFootprint[],
): readonly Vec2[] {
  return transitions.map((transition) =>
    rampUphill(
      transition.area,
      decks.filter((deck) => deck.layer === transition.to).map((deck) => deck.footprint),
    ),
  );
}

/**
 * Each layer's ramp rims (#2975), indexed by layer: every edge of a ramp
 * from the ground but its low end, the one edge a body on the ground may
 * walk into it by. They stop walking only, never sight. A ramp from a
 * deck needs none: its layer already holds a body to its decks and ramps.
 */
export function rampRims(
  transitions: readonly FloorTransition[],
  decks: readonly DeckFootprint[],
  layerCount: number,
): readonly (readonly Segment[])[] {
  const rims: Segment[][] = Array.from({ length: layerCount }, () => []);
  const uphill = uphillDirections(transitions, decks);
  transitions.forEach((transition, at) => {
    const way = uphill[at];
    if (transition.from !== 0 || way === undefined) {
      return;
    }
    const edges = transition.area.map((corner, index) =>
      segment(corner, transition.area[(index + 1) % transition.area.length] ?? corner),
    );
    const along = (edge: Segment): number => dot(scale(add(edge.a, edge.b), 0.5), way);
    const low = edges.reduce((lowest, edge) => (along(edge) < along(lowest) ? edge : lowest));
    rims[0]?.push(...edges.filter((edge) => edge !== low));
  });
  return rims;
}
