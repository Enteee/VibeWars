import { pointInPolygon, type Polygon } from "../geometry.js";
import type { StatusId } from "../skills/status.js";
import type { Vec2 } from "../vec2.js";

/**
 * Map effect zones (ADR-0053, #3024): ground that puts a status on whoever
 * stands in it. A map names a zone's kind; what that kind does lives here,
 * so balance stays in one place and maps stay data.
 */

/** Every kind of zone a map may name: burning ground first, more card by card (#3022). */
export const ZONE_KINDS = ["scorched"] as const;

export type ZoneKind = (typeof ZONE_KINDS)[number];

/**
 * What a kind does: a body in it bears `status`, refreshed every tick to
 * `lingerSeconds`, so it runs on that long once the body steps out.
 */
export interface ZoneRule {
  readonly status: StatusId;
  readonly lingerSeconds: number;
}

export const ZONE_RULES: Readonly<Record<ZoneKind, ZoneRule>> = {
  scorched: { status: "burning", lingerSeconds: 3 },
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
