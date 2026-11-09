import { pointInPolygon, type Vec2 } from "@vibewars/game-core";
import type { MapLighting } from "@vibewars/game-maps/schema";

/** The darkest a body is drawn (ADR-0052): a fighter stays readable in any corner. */
export const BODY_LIGHT_FLOOR = 0.7;
/** The darkest a surface is drawn (ADR-0052). */
export const SURFACE_LIGHT_FLOOR = 0.45;

const WHITE = 0xffffff;
const FLICKER_RADIANS_PER_MS = 0.011;
/** A second, unrelated rate, so a flame never settles into a visible pulse. */
const FLICKER_SECOND_RATE = 2.3;
const DEGREES_TO_RADIANS = Math.PI / 180;

export interface LightSample {
  /** The light's hue as `0xRRGGBB`, its brightest channel at full. */
  colour: number;
  /** How bright it is, from the floor asked for up to 1. */
  intensity: number;
}

/** FNV-1a: a light's phase, so its flicker needs no state and two lights differ. */
function flickerPhase(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193);
  }
  return ((hash >>> 0) / 0x1_0000_0000) * Math.PI * 2;
}

/** What is left of a light at `timeMs`: 1 at its brightest, `1 - flicker` at its dimmest. */
export function flickerAt(id: string, flicker: number, timeMs: number): number {
  if (flicker === 0) {
    return 1;
  }
  const phase = flickerPhase(id);
  const angle = timeMs * FLICKER_RADIANS_PER_MS + phase;
  const wave = (Math.sin(angle) + Math.sin(angle * FLICKER_SECOND_RATE + phase)) / 2;
  return 1 - (flicker * (wave + 1)) / 2;
}

/** Quadratic falloff: 1 at the centre, 0 from `radius` on. */
function falloff(distance: number, radius: number): number {
  const left = 1 - distance / radius;
  return left <= 0 ? 0 : left * left;
}

// The running sum of one `lightAt`, here so that it allocates nothing.
let red = 0;
let green = 0;
let blue = 0;

function add(colour: number, amount: number): void {
  red += ((colour >> 16) & 0xff) * amount;
  green += ((colour >> 8) & 0xff) * amount;
  blue += (colour & 0xff) * amount;
}

/** Whether `point` is in an indoor shape; allocates nothing, polygons included. */
function isIndoors(lighting: MapLighting, point: Vec2): boolean {
  for (const shape of lighting.indoor) {
    const inside =
      shape.kind === "rect"
        ? point.x >= shape.x &&
          point.y >= shape.y &&
          point.x <= shape.x + shape.width &&
          point.y <= shape.y + shape.height
        : pointInPolygon(point, shape.points);
    if (inside) {
      return true;
    }
  }
  return false;
}

/**
 * How lit `point` on `layer` is at `timeMs`, ADR-0052. Ambient, the sun
 * outdoors and every light on the layer add up; shadows are the light
 * map's, so a body's tint never loses the sun behind a wall.
 *
 * `into` is filled and returned, so a frame's bodies can share one sample.
 */
export function lightAt(
  lighting: MapLighting | undefined,
  point: Vec2,
  layer: number,
  timeMs: number,
  floor: number = BODY_LIGHT_FLOOR,
  into: LightSample = { colour: WHITE, intensity: 1 },
): LightSample {
  if (lighting === undefined) {
    into.colour = WHITE;
    into.intensity = 1;
    return into;
  }

  red = 0;
  green = 0;
  blue = 0;
  const indoors = isIndoors(lighting, point);
  const ambient = indoors ? lighting.indoorAmbient : lighting.ambient;
  add(ambient.colour, ambient.intensity);
  if (!indoors && lighting.sun !== undefined) {
    const { colour, intensity, elevationDeg } = lighting.sun;
    add(colour, intensity * Math.sin(elevationDeg * DEGREES_TO_RADIANS));
  }
  for (const light of lighting.lights) {
    if (light.layer === layer) {
      const distance = Math.hypot(point.x - light.position.x, point.y - light.position.y);
      const amount = light.intensity * falloff(distance, light.radius);
      if (amount > 0) {
        add(light.colour, amount * flickerAt(light.id, light.flicker, timeMs));
      }
    }
  }

  const brightest = Math.max(red, green, blue);
  if (brightest === 0) {
    into.colour = WHITE;
    into.intensity = floor;
    return into;
  }
  const scale = 255 / brightest;
  into.colour =
    (Math.round(red * scale) << 16) | (Math.round(green * scale) << 8) | Math.round(blue * scale);
  into.intensity = Math.min(1, Math.max(floor, brightest / 255));
  return into;
}

/** A sample as one colour to multiply by. */
export function tintOf(sample: LightSample): number {
  return scaleColour(sample.colour, sample.intensity);
}

/** `colour` with each channel times `amount`, 0 to 1. */
export function scaleColour(colour: number, amount: number): number {
  return (
    (Math.round(((colour >> 16) & 0xff) * amount) << 16) |
    (Math.round(((colour >> 8) & 0xff) * amount) << 8) |
    Math.round((colour & 0xff) * amount)
  );
}

/** `colour` multiplied, channel by channel, by `tint`. */
export function multiplyColour(colour: number, tint: number): number {
  const channel = (shift: number): number =>
    Math.round((((colour >> shift) & 0xff) * ((tint >> shift) & 0xff)) / 255) << shift;
  return channel(16) | channel(8) | channel(0);
}
