import type { Vec2 } from "../vec2.js";

/**
 * What a Guild Battle's flag (#1225) and a Relic Run's relic (#1374)
 * share, GW1's bundles: one a team, at its spawn, in a carrier's hands
 * or lying where it fell. Each mode adds what it does on arrival; where
 * one is, how it drops and where a player walks for it are here, once.
 *
 * Pure, as `flags.ts` and `relics.ts` are.
 */

/** The flag stand's target id: no seat or creature id is this. */
export const FLAG_STAND_ID = "flag-stand";

/** Where a team's bundle starts, from its map's spawn objective. */
export interface CarriedSpawn {
  readonly team: number;
  readonly position: Vec2;
}

/** Where a bundle is: at its spawn, in someone's hands, or on the ground. */
export type CarriedPlace =
  | { readonly kind: "spawn" }
  | { readonly kind: "carried"; readonly carrierId: string }
  | { readonly kind: "ground"; readonly position: Vec2 };

/** A team's bundle, in a place of `Place`: a flag has one more, the stand. */
export interface CarriedObject<Place extends { readonly kind: string } = CarriedPlace> {
  readonly team: number;
  readonly place: Place;
}

/** A carrier who lets go: dead, leaving, or on the Drop button. */
export interface CarriedDrop {
  readonly kind: "drop";
  readonly carrierId: string;
  readonly position: Vec2;
}

/** A player who reached a bundle, or the stand, this tick. */
export interface CarriedArrival {
  readonly kind: "interact";
  readonly playerId: string;
  readonly team: number;
  readonly targetId: string;
}

export const AT_SPAWN: CarriedPlace = { kind: "spawn" };

/** The bundles a target id can name, by their id's prefix. */
type CarriedKind = "flag" | "relic";

/** The target id of `team`'s bundle of `kind`: no seat's id has a `/` in it. */
export function carriedObjectId(kind: CarriedKind, team: number): string {
  return `${kind}/${String(team)}`;
}

/** The team whose bundle of `kind` `id` names, or `undefined` if it names none. */
export function carriedObjectTeam(kind: CarriedKind, id: string): number | undefined {
  const match = /^(flag|relic)\/(\d+)$/.exec(id);
  return match?.[1] === kind ? Number(match[2]) : undefined;
}

/** Whether `id` names a flag, a relic or the flag stand: what Space walks to, not a body. */
export function isCarriedObjectId(id: string): boolean {
  return (
    id === FLAG_STAND_ID ||
    carriedObjectTeam("flag", id) !== undefined ||
    carriedObjectTeam("relic", id) !== undefined
  );
}

/** Any team's bundle, whatever places its mode adds. */
type AnyCarried = CarriedObject<{ readonly kind: string }>;

/** The bundle `carrierId` carries, or `undefined`. */
export function carriedBy<T extends AnyCarried>(
  objects: readonly T[],
  carrierId: string,
): T | undefined {
  return objects.find(({ place }) => carrierOf(place) === carrierId);
}

/** `objects` with the one `carrierId` carries lying at `position`; unchanged if none. */
export function dropCarried<T extends AnyCarried>(
  objects: readonly T[],
  carrierId: string,
  position: Vec2,
): (T | CarriedObject)[] {
  return objects.map((object) =>
    carrierOf(object.place) === carrierId
      ? { team: object.team, place: { kind: "ground", position } }
      : object,
  );
}

/**
 * Where a player walks to for `object`: its spawn, or where it lies.
 * `undefined` while carried, or in a mode's own place.
 */
export function lyingPosition(
  spawns: readonly CarriedSpawn[],
  object: AnyCarried,
): Vec2 | undefined {
  const place: { readonly kind: string } = object.place;
  if (!isCarried(place)) {
    return undefined;
  }
  switch (place.kind) {
    case "spawn":
      return spawns.find(({ team }) => team === object.team)?.position;
    case "ground":
      return place.position;
    case "carried":
      return undefined;
  }
}

/**
 * The drops of every carrier `fallen` says is down this tick, where it
 * says they lie: the simulation's dead.
 */
export function fallenDrops(
  objects: readonly AnyCarried[],
  fallen: (carrierId: string) => Vec2 | undefined,
): CarriedDrop[] {
  return objects.flatMap(({ place }) => {
    const carrierId = carrierOf(place);
    const position = carrierId === undefined ? undefined : fallen(carrierId);
    return carrierId === undefined || position === undefined
      ? []
      : [{ kind: "drop" as const, carrierId, position }];
  });
}

/** Who carries a bundle in `place`, or `undefined` if nobody does. */
function carrierOf(place: { readonly kind: string }): string | undefined {
  return isCarried(place) && place.kind === "carried" ? place.carrierId : undefined;
}

/** Whether `place` is one of the three every bundle has, not a mode's own. */
function isCarried(place: { readonly kind: string }): place is CarriedPlace {
  return place.kind === "spawn" || place.kind === "carried" || place.kind === "ground";
}
