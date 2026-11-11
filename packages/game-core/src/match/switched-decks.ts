import { polygonSides, type Polygon, type Segment } from "../geometry.js";
import { vec2, type Vec2 } from "../vec2.js";

/**
 * Switched decks (#3068): a deck that comes and goes. Up, it is walked
 * as any deck; down, its footprint's sides close as a gate's wall does,
 * so nobody steps on it and no path crosses it. Whoever stands on it as
 * it goes down is pushed off to its nearer end (`push-off`, a drawbridge
 * raised at its hinge) or falls to the layer under it (`fall`, a rope
 * bridge cut, a floor collapsed).
 *
 * A switch that names it toggles it; a `once` deck changes only once,
 * and an `afterCrossings` one goes down by itself once that many bodies
 * have stepped onto it, each step on counting once.
 *
 * Pure: the simulation counts the flips and who stepped on; this decides
 * how the deck stands.
 */

/** Which side of its footprint a drawbridge is hinged on. */
export type DeckHinge = "n" | "e" | "s" | "w";

/** A switched deck as the map lays it out. */
export interface SwitchedDeckField {
  readonly id: string;
  /** Its index in the match's decks (`MatchLayers.decks`). */
  readonly deck: number;
  readonly layer: number;
  readonly footprint: Polygon;
  readonly startsUp: boolean;
  readonly whenDown: "push-off" | "fall";
  readonly once: boolean;
  /** How many steps on bring it down; `null` for none. */
  readonly afterCrossings: number | null;
  /** A drawbridge's hinge; `null` for a deck that falls. */
  readonly hinge: DeckHinge | null;
}

/** One switched deck as it stands. */
export interface SwitchedDeckState {
  /** Whether it can be walked on. */
  readonly up: boolean;
  /** Bodies that have stepped onto it so far: its cracks. */
  readonly crossings: number;
}

/** A switched deck on the map, and how it stands. */
export interface SwitchedDeck extends SwitchedDeckField, SwitchedDeckState {}

/** Every switched deck as the map starts it, uncracked. */
export function initialSwitchedDecks(fields: readonly SwitchedDeckField[]): SwitchedDeck[] {
  return fields.map((field) => ({ ...field, up: field.startsUp, crossings: 0 }));
}

/** Whether `deck` has changed all it ever will: a `once` deck no longer as it started. */
export function spent(deck: SwitchedDeck): boolean {
  return deck.once && deck.up !== deck.startsUp;
}

/**
 * `deck` toggled if `flipped`, with `entered` more bodies stepped onto
 * it, going down once its crossings reach `afterCrossings`. A spent deck
 * stays as it is, so a lever still naming a collapsed floor does nothing.
 */
export function stepSwitchedDeck(
  deck: SwitchedDeck,
  flipped: boolean,
  entered: number,
): SwitchedDeck {
  if (spent(deck) || (!flipped && entered === 0)) {
    return deck;
  }
  const crossings =
    deck.afterCrossings !== null && deck.up ? deck.crossings + entered : deck.crossings;
  const toggled = flipped ? !deck.up : deck.up;
  const up = toggled && (deck.afterCrossings === null || crossings < deck.afterCrossings);
  return up === deck.up && crossings === deck.crossings ? deck : { ...deck, up, crossings };
}

/** The wall `deck` is while down: every side of its footprint. */
export function deckSegments(deck: SwitchedDeckField): Segment[] {
  return polygonSides(deck.footprint);
}

/**
 * Where a body at `position` on a drawbridge going up is pushed: just
 * past the end of its span nearer to it, `clearance` and a unit clear;
 * on a tie, the end away from the hinge.
 */
export function pushOffPoint(deck: SwitchedDeckField, position: Vec2, clearance: number): Vec2 {
  const axis = deck.hinge === "e" || deck.hinge === "w" ? "x" : "y";
  const along = deck.footprint.map((corner) => corner[axis]);
  const low = Math.min(...along);
  const high = Math.max(...along);
  const hingeLow = deck.hinge === "n" || deck.hinge === "w";
  const toLow = position[axis] - low;
  const toHigh = high - position[axis];
  const lowEnd = toLow === toHigh ? !hingeLow : toLow < toHigh;
  const end = lowEnd ? low - clearance - 1 : high + clearance + 1;
  return axis === "x" ? vec2(end, position.y) : vec2(position.x, end);
}
