import { pointInPolygon, type Vec2 } from "@vibewars/game-core";
import type { MapLighting } from "@vibewars/game-maps/schema";

import { DECK_SHADOW, DECK_TINT } from "./arena-palette.js";
import type { MapStructure, RenderableShape, RenderableWall } from "./arena-snapshot.js";
import { shapeOutline } from "./layer-surfaces.js";
import { isIndoors } from "./lighting-model.js";
import { ELEVATION_STEP } from "./render-order.js";

/**
 * The hard shadows of a lit arena (#2988, ADR-0052), as polygons whose
 * union is the shadow. Pure, so it can be tested in Node; the lighting
 * pass paints them into its light maps once per map.
 */

/** How tall a wall or a deck stands for its shadow: one layer step, for both. */
export const CASTER_HEIGHT = ELEVATION_STEP;

/** A point light's shadow is cut in pieces this wide, so its far edge stays outside the light. */
const MOST_PIECE_RADIANS = Math.PI / 6;
/** How far past its radius a point light's shadow reaches. */
const LIGHT_SHADOW_REACH = 1.2;

export type Outline = readonly Vec2[];

/**
 * How far, and which way, the sun throws a shadow of `height` on the
 * ground: away from where it comes from, longer as it stands lower.
 */
export function sunShadowOffset(sun: NonNullable<MapLighting["sun"]>, height: number): Vec2 {
  const towards = (sun.directionDeg * Math.PI) / 180;
  const length = height / Math.tan((sun.elevationDeg * Math.PI) / 180);
  // From the top of the map, clockwise: the light comes from (sin, -cos).
  return { x: -Math.sin(towards) * length, y: Math.cos(towards) * length };
}

/**
 * The sun's shadow of a block standing on `outline`: the outline moved by
 * `offset`, and every edge swept along it, so a concave block needs no
 * hull. None for a sun overhead.
 */
export function sunShadow(outline: Outline, offset: Vec2): readonly Outline[] {
  if (Math.hypot(offset.x, offset.y) < 0.5) {
    return [];
  }
  const moved = outline.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }));
  return [
    moved,
    ...outline.map((a, k) => {
      const b = outline[(k + 1) % outline.length] ?? a;
      const bMoved = moved[(k + 1) % moved.length] ?? b;
      const aMoved = moved[k] ?? a;
      return [a, b, bMoved, aMoved];
    }),
  ];
}

/**
 * A point light's shadow of `outline`: the ground behind each edge, seen
 * from `light`, out past `radius`. A light inside the outline, as one in
 * a wall, throws none: it is ignored, not refused.
 */
export function lightShadow(outline: Outline, light: Vec2, radius: number): readonly Outline[] {
  if (pointInPolygon(light, outline)) {
    return [];
  }
  const far = radius * LIGHT_SHADOW_REACH;
  const away = (p: Vec2): Vec2 => {
    const dx = p.x - light.x;
    const dy = p.y - light.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      return p;
    }
    const reach = Math.max(length, far) / length;
    return { x: light.x + dx * reach, y: light.y + dy * reach };
  };
  const shadows: Outline[] = [];
  outline.forEach((a, k) => {
    const b = outline[(k + 1) % outline.length] ?? a;
    const turn = Math.abs(
      Math.atan2(
        (a.x - light.x) * (b.y - light.y) - (a.y - light.y) * (b.x - light.x),
        (a.x - light.x) * (b.x - light.x) + (a.y - light.y) * (b.y - light.y),
      ),
    );
    const pieces = Math.max(1, Math.ceil(turn / MOST_PIECE_RADIANS));
    for (let piece = 0; piece < pieces; piece += 1) {
      const from = lerp(a, b, piece / pieces);
      const to = lerp(a, b, (piece + 1) / pieces);
      shadows.push([from, to, away(to), away(from)]);
    }
  });
  return shadows;
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * What throws a shadow on `layer`: its own walls, and on the ground every
 * deck too. A deck shadows the ground only, never a deck below it.
 */
export function shadowCasters(
  walls: readonly RenderableWall[],
  structure: MapStructure,
  layer: number,
): readonly Outline[] {
  return [
    ...walls.filter((wall) => wall.layer === layer).map(shapeOutline),
    ...(layer === 0 ? structure.decks.map((deck) => shapeOutline(deck.footprint)) : []),
  ];
}

/**
 * The sun's shadows on `layer`; none without a sun. A caster standing
 * wholly indoors throws none: the sun does not reach it.
 */
export function layerSunShadows(
  lighting: MapLighting,
  casters: readonly Outline[],
): readonly Outline[] {
  if (lighting.sun === undefined) {
    return [];
  }
  const offset = sunShadowOffset(lighting.sun, CASTER_HEIGHT);
  return casters
    .filter((caster) => !caster.every((point) => isIndoors(lighting, point)))
    .flatMap((caster) => sunShadow(caster, offset));
}

/**
 * A light's shadows from the casters that reach into its circle. A light
 * inside a caster, as one set in a wall, throws none at all: it is
 * ignored, not refused, and still shines.
 */
export function layerLightShadows(
  light: MapLighting["lights"][number],
  casters: readonly Outline[],
): readonly Outline[] {
  const { position, radius } = light;
  if (casters.some((caster) => pointInPolygon(position, caster))) {
    return [];
  }
  return casters
    .filter((caster) => touches(caster, position, radius))
    .flatMap((caster) => lightShadow(caster, position, radius));
}

/** Whether any edge of `outline` passes within `radius` of `centre`. */
function touches(outline: Outline, centre: Vec2, radius: number): boolean {
  return outline.some((a, k) => {
    const b = outline[(k + 1) % outline.length] ?? a;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((centre.x - a.x) * dx + (centre.y - a.y) * dy) / length));
    return Math.hypot(a.x + dx * t - centre.x, a.y + dy * t - centre.y) <= radius;
  });
}

/** The few drawing calls a deck's fixed shadow needs, in Phaser `Graphics` terms. */
export interface DeckShadowPainter {
  save(): void;
  restore(): void;
  translateCanvas(x: number, y: number): void;
  fillStyle(colour: number, alpha: number): void;
  fillShape(shape: RenderableShape): void;
}

/**
 * What each bridge throws on the ground: a hard shadow, and the ground
 * under it a step darker. Where the light maps cast shadows (#2988) they
 * replace the fixed one; the step darker stays.
 */
export function paintDeckShadows(
  painter: DeckShadowPainter,
  structure: MapStructure,
  lightShadows: boolean,
): void {
  for (const deck of structure.decks) {
    if (deck.layer !== 1) {
      continue;
    }
    if (!lightShadows) {
      painter.save();
      painter.translateCanvas(DECK_SHADOW.offset, DECK_SHADOW.offset);
      painter.fillStyle(DECK_SHADOW.colour, DECK_SHADOW.alpha);
      painter.fillShape(deck.footprint);
      painter.restore();
    }
    painter.fillStyle(DECK_TINT.colour, DECK_TINT.alpha);
    painter.fillShape(deck.footprint);
  }
}
