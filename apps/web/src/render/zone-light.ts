import { MAX_LIGHTS, type MapLighting } from "@vibewars/game-maps/schema";

import type { MapZone } from "./arena-snapshot.js";
import type { LightsOf } from "./lighting-pass.js";
import { shapeOutline } from "./layer-surfaces.js";
import { ZONE_LOOK, zoneCentroid } from "./zone-look.js";

/** A zone light's id: never a torch's or a fire's, so it stands no mark. */
const ZONE_LIGHT_PREFIX = "zone-";

/**
 * The lights `zones` cast (#3052): one per zone whose kind has a light,
 * on its centroid, reaching `radiusScale` times its outline's
 * half-diagonal. Render only: the map file has none of them. With
 * `mapLights` already lit, past `MAX_LIGHTS` the rest are dropped in map
 * order.
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
      radius: light.radiusScale * halfDiagonal,
      colour: light.colour,
      intensity: light.intensity,
      flicker: light.flicker,
    });
  }
  return lights;
}

/** `lighting` with its zones' lights after the map's own; itself when they cast none. */
export function withZoneLights(lighting: MapLighting, zones: readonly MapZone[]): MapLighting {
  const lights = zoneLights(zones, lighting.lights.length);
  return lights.length === 0 ? lighting : { ...lighting, lights: [...lighting.lights, ...lights] };
}
