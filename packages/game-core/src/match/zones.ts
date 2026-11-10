import type { DamageType } from "../equipment/types.js";
import { pointInPolygon, type Polygon } from "../geometry.js";
import type { StatusId } from "../skills/status.js";
import { add, distance, scale, sub, vec2, type Vec2 } from "../vec2.js";

/**
 * Map effect zones (ADR-0053, #3024): ground that puts a status on whoever
 * stands in it. A map names a zone's kind; what that kind does lives here,
 * so balance stays in one place and maps stay data.
 */

/**
 * Every kind of zone a map may name: harmful ground (#3024, #3027), ground
 * that helps or taxes (#3028), more card by card (#3022).
 */
export const ZONE_KINDS = [
  "scorched",
  "molten",
  "toxic-fog",
  "mire",
  "foul-water",
  "spring",
  "grove",
  "tainted-water",
  "draining-spire",
  "vent",
  "gas-spout",
  "rockfall",
] as const;

export type ZoneKind = (typeof ZONE_KINDS)[number];

/**
 * What a kind does. A `while-inside` kind: a body in it bears each of
 * `statuses`, refreshed every tick to `lingerSeconds`, so they run on that
 * long once the body steps out. A `strike` kind (#3029) hits each body in
 * it once per window, or once per pass for a moving one: `damage` of
 * `damageType` through armor, then each of `statuses` for `statusSeconds`.
 * Bots route round `harmful` ground and step out of it (#3026).
 */
export type ZoneRule =
  | {
      readonly trigger: "while-inside";
      readonly statuses: readonly StatusId[];
      readonly lingerSeconds: number;
      readonly harmful: boolean;
    }
  | {
      readonly trigger: "strike";
      readonly damage: number;
      readonly damageType: DamageType;
      readonly statuses: readonly StatusId[];
      readonly statusSeconds: number;
      readonly harmful: true;
    };

export const ZONE_RULES: Readonly<Record<ZoneKind, ZoneRule>> = {
  scorched: { trigger: "while-inside", statuses: ["burning"], lingerSeconds: 3, harmful: true },
  // GW1's environment effects: Lava, Acid Trap's gas, Quicksand, Swamp Water.
  molten: {
    trigger: "while-inside",
    statuses: ["burning", "crippled"],
    lingerSeconds: 3,
    harmful: true,
  },
  "toxic-fog": { trigger: "while-inside", statuses: ["poison"], lingerSeconds: 5, harmful: true },
  mire: { trigger: "while-inside", statuses: ["mired"], lingerSeconds: 1, harmful: true },
  "foul-water": { trigger: "while-inside", statuses: ["fouled"], lingerSeconds: 1, harmful: true },
  // Springs, groves, tainted water and draining spires (#3028); bots shun
  // the two that tax them, and do not seek out the two that help.
  spring: { trigger: "while-inside", statuses: ["refreshed"], lingerSeconds: 1, harmful: false },
  grove: { trigger: "while-inside", statuses: ["fleet"], lingerSeconds: 1, harmful: false },
  "tainted-water": {
    trigger: "while-inside",
    statuses: ["tainted"],
    lingerSeconds: 1,
    harmful: true,
  },
  "draining-spire": {
    trigger: "while-inside",
    statuses: ["drained"],
    lingerSeconds: 1,
    harmful: true,
  },
  // Timed and moving hazards (#3029): GW1's fire jets, Poison Spout ("50
  // damage and Poisoning target for 12 seconds") and falling rocks.
  vent: {
    trigger: "strike",
    damage: 50,
    damageType: "fire",
    statuses: ["burning"],
    statusSeconds: 3,
    harmful: true,
  },
  "gas-spout": {
    trigger: "strike",
    damage: 50,
    damageType: "typeless",
    statuses: ["poison"],
    statusSeconds: 12,
    harmful: true,
  },
  rockfall: {
    trigger: "strike",
    damage: 60,
    damageType: "earth",
    statuses: ["crippled"],
    statusSeconds: 3,
    harmful: true,
  },
};

/** How long a timed zone shows it is about to strike before it does (#3029). */
export const ZONE_TELEGRAPH_SECONDS = 1;

/** How soon a moving zone may hit the same body again (#3029). */
export const ZONE_REHIT_SECONDS = 1;

/**
 * When a timed zone strikes (#3029): each period, from `offsetSeconds` on,
 * it telegraphs for `ZONE_TELEGRAPH_SECONDS`, is active for
 * `activeSeconds`, then idles out the rest.
 */
export interface ZoneSchedule {
  readonly periodSeconds: number;
  readonly activeSeconds: number;
  readonly offsetSeconds: number;
}

/** A moving zone's way (#3029): it slides along `points` at `speed` units a second, there and back. */
export interface ZonePath {
  readonly points: readonly Vec2[];
  readonly speed: number;
}

export type ZonePhase = "idle" | "telegraph" | "active";

/**
 * A zone as the simulation takes it: its area as one polygon, on one layer.
 * A timed one has a `schedule`; a moving one a `path`, its polygon drawn
 * at the path's first point. With neither it is always on.
 */
export interface MatchZone {
  readonly id: string;
  readonly kind: ZoneKind;
  readonly layer: number;
  readonly polygon: Polygon;
  readonly schedule?: ZoneSchedule;
  readonly path?: ZonePath;
}

/** Which window of its schedule `schedule` is in at `seconds`, and where in its period. */
function scheduleAt(schedule: ZoneSchedule, seconds: number): { window: number; into: number } {
  const since = seconds - schedule.offsetSeconds;
  const window = Math.floor(since / schedule.periodSeconds);
  return { window, into: since - window * schedule.periodSeconds };
}

/**
 * Where `zone` is in its beat at `seconds` of match time (#3029): a pure
 * function of the clock, so every peer agrees without a word on the wire.
 * A zone with no schedule is always active.
 */
export function zonePhaseAt(
  zone: { readonly schedule?: ZoneSchedule | undefined },
  seconds: number,
): ZonePhase {
  if (zone.schedule === undefined) {
    return "active";
  }
  const { into } = scheduleAt(zone.schedule, seconds);
  return into < ZONE_TELEGRAPH_SECONDS
    ? "telegraph"
    : into < ZONE_TELEGRAPH_SECONDS + zone.schedule.activeSeconds
      ? "active"
      : "idle";
}

/** The number of `zone`'s strike window at `seconds`: it changes once per period. */
export function zoneWindowAt(zone: MatchZone, seconds: number): number {
  return zone.schedule === undefined ? 0 : scheduleAt(zone.schedule, seconds).window;
}

/** How far a moving zone has come from its path's first point at `seconds`; none for a still one. */
export function zoneOffsetAt(path: ZonePath | undefined, seconds: number): Vec2 {
  const start = path?.points[0];
  if (path === undefined || start === undefined) {
    return vec2(0, 0);
  }
  const legs = path.points.slice(1).map((to, index) => {
    const from = path.points[index] ?? to;
    return { from, to, length: distance(from, to) };
  });
  const length = legs.reduce((sum, leg) => sum + leg.length, 0);
  if (length === 0) {
    return vec2(0, 0);
  }
  // There and back: past the end it walks the path in reverse.
  const travelled = (path.speed * seconds) % (2 * length);
  let along = travelled <= length ? travelled : 2 * length - travelled;
  for (const leg of legs) {
    if (along <= leg.length) {
      const at =
        leg.length === 0
          ? leg.from
          : add(leg.from, scale(sub(leg.to, leg.from), along / leg.length));
      return sub(at, start);
    }
    along -= leg.length;
  }
  return sub(path.points[path.points.length - 1] ?? start, start);
}

/** `zone`'s polygon at `seconds` (#3029): moved along its path, or where it stands. */
export function zonePolygonAt(zone: MatchZone, seconds: number): Polygon {
  if (zone.path === undefined) {
    return zone.polygon;
  }
  const offset = zoneOffsetAt(zone.path, seconds);
  return zone.polygon.map((point) => add(point, offset));
}

/**
 * The ground a zone may cover over its life (#3029): a moving zone's
 * polygon swept along its path, as one convex hull; any other's own polygon.
 * Bots weigh their paths by this, so a lane of rolling rocks is gone round.
 */
export function zoneReach(polygon: Polygon, path: ZonePath | undefined): Polygon {
  const start = path?.points[0];
  if (path === undefined || start === undefined) {
    return polygon;
  }
  return convexHull(
    path.points.flatMap((point) => polygon.map((corner) => add(corner, sub(point, start)))),
  );
}

/** The convex hull of `points`, counter-clockwise (Andrew's monotone chain). */
function convexHull(points: readonly Vec2[]): Polygon {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec2, a: Vec2, b: Vec2): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (from: readonly Vec2[]): Vec2[] => {
    const chain: Vec2[] = [];
    for (const point of from) {
      while (chain.length >= 2) {
        const a = chain[chain.length - 2];
        const b = chain[chain.length - 1];
        if (a === undefined || b === undefined || cross(a, b, point) > 0) break;
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

const ZONE_SOURCE_PREFIX = "zone:";

/**
 * The status source a zone's status carries: the environment, never a player.
 * The kind travels in it, so the log names the ground without the map (#3046).
 */
export function zoneSourceId(zone: MatchZone): string {
  return `${ZONE_SOURCE_PREFIX}${zone.kind}:${zone.id}`;
}

/** Whether a status or log source is a zone's: the log names it as the environment. */
export function isZoneSourceId(sourceId: string): boolean {
  return sourceId.startsWith(ZONE_SOURCE_PREFIX);
}

/** The kind a zone's source names; `undefined` for any other or a malformed source. */
export function zoneKindOfSource(sourceId: string): ZoneKind | undefined {
  if (!isZoneSourceId(sourceId)) return undefined;
  const rest = sourceId.slice(ZONE_SOURCE_PREFIX.length);
  const end = rest.indexOf(":");
  if (end < 0) return undefined;
  const kind = rest.slice(0, end);
  return ZONE_KINDS.find((known) => known === kind);
}

/** The zones a body at `position` on `layer` stands in, in the map's order. */
export function zonesHolding(
  zones: readonly MatchZone[],
  position: Vec2,
  layer: number,
): MatchZone[] {
  return zones.filter((zone) => zone.layer === layer && pointInPolygon(position, zone.polygon));
}

/** The harmful zones a body at `position` on `layer` stands in (#3026). */
export function harmfulZonesHolding(
  zones: readonly MatchZone[],
  position: Vec2,
  layer: number,
): MatchZone[] {
  return zonesHolding(zones, position, layer).filter((zone) => ZONE_RULES[zone.kind].harmful);
}
