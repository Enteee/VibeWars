import { pointInPolygon, type Polygon } from "../geometry.js";
import type { StatusId } from "../skills/status.js";
import type { Vec2 } from "../vec2.js";

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
] as const;

export type ZoneKind = (typeof ZONE_KINDS)[number];

/**
 * What a kind does: a body in it bears each of `statuses`, refreshed every
 * tick to `lingerSeconds`, so they run on that long once the body steps out.
 * Bots route round `harmful` ground and step out of it (#3026).
 */
export interface ZoneRule {
  readonly statuses: readonly StatusId[];
  readonly lingerSeconds: number;
  readonly harmful: boolean;
}

export const ZONE_RULES: Readonly<Record<ZoneKind, ZoneRule>> = {
  scorched: { statuses: ["burning"], lingerSeconds: 3, harmful: true },
  // GW1's environment effects: Lava, Acid Trap's gas, Quicksand, Swamp Water.
  molten: { statuses: ["burning", "crippled"], lingerSeconds: 3, harmful: true },
  "toxic-fog": { statuses: ["poison"], lingerSeconds: 5, harmful: true },
  mire: { statuses: ["mired"], lingerSeconds: 1, harmful: true },
  "foul-water": { statuses: ["fouled"], lingerSeconds: 1, harmful: true },
  // Springs, groves, tainted water and draining spires (#3028); bots shun
  // the two that tax them, and do not seek out the two that help.
  spring: { statuses: ["refreshed"], lingerSeconds: 1, harmful: false },
  grove: { statuses: ["fleet"], lingerSeconds: 1, harmful: false },
  "tainted-water": { statuses: ["tainted"], lingerSeconds: 1, harmful: true },
  "draining-spire": { statuses: ["drained"], lingerSeconds: 1, harmful: true },
};

/** A zone as the simulation takes it: its area as one polygon, on one layer. */
export interface MatchZone {
  readonly id: string;
  readonly kind: ZoneKind;
  readonly layer: number;
  readonly polygon: Polygon;
}

const ZONE_SOURCE_PREFIX = "zone:";

/** The status source a zone's status carries: the environment, never a player. */
export function zoneSourceId(zone: MatchZone): string {
  return `${ZONE_SOURCE_PREFIX}${zone.id}`;
}

/** Whether a status or log source is a zone's: the log names it as the environment. */
export function isZoneSourceId(sourceId: string): boolean {
  return sourceId.startsWith(ZONE_SOURCE_PREFIX);
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
