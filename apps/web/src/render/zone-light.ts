import { polygonCentre } from "@vibewars/game-core";
import { MAX_LIGHTS, type MapLighting } from "@vibewars/game-maps/schema";

import { TELEPORT_MARK_LOOK } from "./arena-palette.js";
import type { MapZone } from "./arena-snapshot.js";
import type { RenderableTeleport } from "./flag-objects.js";
import type { LightsOf } from "./lighting-pass.js";
import { shapeOutline } from "./layer-surfaces.js";
import { ZONE_LOOK, zoneCentroid } from "./zone-look.js";

/** A zone light's id: never a torch's or a fire's, so it stands no mark. */
const ZONE_LIGHT_PREFIX = "zone-";

/** A portal light's, likewise. */
const TELEPORT_LIGHT_PREFIX = "teleport-";

/**
 * The farthest a zone's light reaches. A light's cost grows with its
 * area, and a long river of lava would otherwise cast one the size of the
 * map from its middle (#3225).
 */
export const ZONE_LIGHT_MAX_RADIUS = 320;

/**
 * The lights `zones` cast (#3052): one per zone whose kind has a light,
 * on its centroid, reaching `radiusScale` times its outline's
 * half-diagonal, at most `ZONE_LIGHT_MAX_RADIUS`. Render only: the map
 * file has none of them. With `mapLights` already lit, past `MAX_LIGHTS`
 * the rest are dropped in map order.
 */
export function zoneLights(zones: readonly MapZone[], mapLights: number): readonly LightsOf[] {
  const lights: LightsOf[] = [];
  for (const [index, zone] of zones.entries()) {
    const light = ZONE_LOOK[zone.kind].light;
    if (light === undefined) {
      continue;
    }
    if (mapLights + lights.length >= MAX_LIGHTS) {
      break;
    }
    const outline = shapeOutline(zone.area);
    const xs = outline.map((corner) => corner.x);
    const ys = outline.map((corner) => corner.y);
    const halfDiagonal =
      Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
    lights.push({
      id: `${ZONE_LIGHT_PREFIX}${String(index)}`,
      position: zoneCentroid(zone.area),
      layer: zone.layer,
      radius: Math.min(light.radiusScale * halfDiagonal, ZONE_LIGHT_MAX_RADIUS),
      colour: light.colour,
      intensity: light.intensity,
      flicker: light.flicker,
    });
  }
  return lights;
}

/** A portal that is on glows aqua (#3030, docs/art/3030-world-elements.md); one that is off casts nothing. */
const TELEPORT_LIGHT = { colour: TELEPORT_MARK_LOOK.swirl, intensity: 0.4, radiusScale: 1.4 };

/**
 * The lights the portals that are on cast (#3030): one at each entry's
 * centre, reaching `radiusScale` times its area's half-diagonal. Render
 * only, as a zone's; past `MAX_LIGHTS` with `lit` already lit, the rest
 * are dropped in map order.
 */
export function teleportLights(
  teleports: readonly RenderableTeleport[],
  lit: number,
): readonly LightsOf[] {
  const lights: LightsOf[] = [];
  for (const teleport of teleports) {
    if (!teleport.on) {
      continue;
    }
    if (lit + lights.length >= MAX_LIGHTS) {
      break;
    }
    const xs = teleport.from.area.map((corner) => corner.x);
    const ys = teleport.from.area.map((corner) => corner.y);
    const halfDiagonal =
      Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
    lights.push({
      id: `${TELEPORT_LIGHT_PREFIX}${teleport.id}`,
      position: polygonCentre(teleport.from.area),
      layer: teleport.from.layer,
      radius: TELEPORT_LIGHT.radiusScale * halfDiagonal,
      colour: TELEPORT_LIGHT.colour,
      intensity: TELEPORT_LIGHT.intensity,
      flicker: 0,
    });
  }
  return lights;
}

/**
 * `lighting` with its zones' lights and its portals' after the map's own;
 * itself when they cast none.
 */
export function withZoneLights(
  lighting: MapLighting,
  zones: readonly MapZone[],
  teleports: readonly RenderableTeleport[],
): MapLighting {
  const lights = zoneLights(zones, lighting.lights.length);
  const portals = teleportLights(teleports, lighting.lights.length + lights.length);
  return lights.length + portals.length === 0
    ? lighting
    : { ...lighting, lights: [...lighting.lights, ...lights, ...portals] };
}
