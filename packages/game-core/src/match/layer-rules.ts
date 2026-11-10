import { pointInPolygon, segment, type Polygon, type Segment } from "../geometry.js";
import { wieldsFor, type WeaponId } from "../equipment/weapons.js";
import { HEIGHT_DAMAGE_PERCENT, HEIGHT_RANGE_PERCENT } from "../match-rules.js";
import { add, distance, dot, scale, sub, type Vec2 } from "../vec2.js";

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

/** Which way a ramp climbs, as a map names it (#2973). */
export type Uphill = "n" | "e" | "s" | "w";

/** Each way a ramp climbs, as a unit vector: north is up the map. */
export const UPHILL: Readonly<Record<Uphill, Vec2>> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};

/** A ramp's area, the two layers it connects, and which way it climbs. */
export interface FloorTransition {
  readonly from: number;
  readonly to: number;
  readonly area: Polygon;
  readonly uphill: Vec2;
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

/** What `rampRims` reads of a map's layers. */
export interface RimLayers {
  readonly count: number;
  readonly ground: number;
  readonly transitions: readonly FloorTransition[];
  readonly pits: readonly Polygon[];
}

/** `area`'s edges, each from a corner to the next. */
function edgesOf(area: Polygon): Segment[] {
  return area.map((corner, index) => segment(corner, area[(index + 1) % area.length] ?? corner));
}

/** The midpoint of `edge`, measured along `way`. */
function along(edge: Segment, way: Vec2): number {
  return dot(scale(add(edge.a, edge.b), 0.5), way);
}

/** What is left of `edge` once each of `gaps` lying along it is cut out (#2973). */
function cutOut(edge: Segment, gaps: readonly Segment[]): Segment[] {
  const span = sub(edge.b, edge.a);
  const length = Math.hypot(span.x, span.y);
  if (length === 0) {
    return [];
  }
  const t = (point: Vec2): number => dot(sub(point, edge.a), span) / (length * length);
  const onLine = (point: Vec2): boolean =>
    Math.abs(span.x * (point.y - edge.a.y) - span.y * (point.x - edge.a.x)) / length < 1e-6;
  const cuts = gaps
    .filter((gap) => onLine(gap.a) && onLine(gap.b))
    .map((gap) => [Math.min(t(gap.a), t(gap.b)), Math.max(t(gap.a), t(gap.b))] as const)
    .sort((first, second) => first[0] - second[0]);
  const pieces: Segment[] = [];
  let from = 0;
  for (const [low, high] of cuts) {
    if (low > from) {
      pieces.push(
        segment(add(edge.a, scale(span, from)), add(edge.a, scale(span, Math.min(low, 1)))),
      );
    }
    from = Math.max(from, high);
  }
  if (from < 1) {
    pieces.push(segment(add(edge.a, scale(span, from)), edge.b));
  }
  return pieces;
}

/**
 * Each layer's rims (#2975, #2973), indexed by layer, all on the ground:
 * every edge of a ramp up from the ground but its low end, every edge of a
 * ramp down into a pit but its high end, and every pit's edge but where a
 * ramp's high end meets it. A body on the ground walks into a ramp, or a
 * pit, by those ends only. They stop walking, never sight. A ramp between
 * decks needs none: its layer already holds a body to its decks and ramps.
 */
export function rampRims(layers: RimLayers): readonly (readonly Segment[])[] {
  const rims: Segment[][] = Array.from({ length: layers.count }, () => []);
  const ground = rims[layers.ground];
  if (ground === undefined) {
    return rims;
  }
  const highEnds: Segment[] = [];
  for (const transition of layers.transitions) {
    const { uphill } = transition;
    if (transition.from !== layers.ground && transition.to !== layers.ground) {
      continue;
    }
    const edges = edgesOf(transition.area);
    const fromGround = transition.from === layers.ground;
    const end = edges.reduce((best, edge) =>
      fromGround === along(edge, uphill) < along(best, uphill) ? edge : best,
    );
    if (!fromGround) {
      highEnds.push(end);
    }
    ground.push(...edges.filter((edge) => edge !== end));
  }
  for (const pit of layers.pits) {
    ground.push(...edgesOf(pit).flatMap((edge) => cutOut(edge, highEnds)));
  }
  return rims;
}
