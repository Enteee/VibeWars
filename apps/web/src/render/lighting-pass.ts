import Phaser from "phaser";

import type { Vec2 } from "@vibewars/game-core";
import type { MapLighting } from "@vibewars/game-maps/schema";

import type { ArenaPalette, OverhangLookColours } from "./arena-palette.js";
import type { MapStructure, RenderableShape, RenderableWall } from "./arena-snapshot.js";
import { boxMeets, boxUnder, clipConvex, coverBoxes } from "./cell-cover.js";
import type { Box } from "./graphics-cull.js";
import {
  deckCovers,
  rampDrawing,
  shapeOutline,
  tunnelCoverBox,
  tunnelFarWall,
  tunnelOpenings,
  tunnelRoof,
} from "./layer-surfaces.js";
import {
  SURFACE_LIGHT_FLOOR,
  flickerAt,
  lightAt,
  multiplyColour,
  tintOf,
} from "./lighting-model.js";
import { elevationOf, renderOrder } from "./render-order.js";
import {
  layerLightShadows,
  layerSunShadows,
  shadowCasters,
  type Outline,
} from "./shadow-geometry.js";

/**
 * The light maps of a lit arena (ADR-0052): per layer, half resolution,
 * multiplied over that layer's surfaces. What can be decided without a
 * renderer is exported as plain functions, for the tests.
 */

/** Half the arena's resolution: a soft falloff gains nothing from more. */
const LIGHT_MAP_SCALE = 0.5;
/** The side of a cell a light map shows in, in its pixels (#3162). */
const LIGHT_MAP_CELL = 32;
const FALLOFF_TEXTURE = "lighting-falloff";
const FALLOFF_SIZE = 256;
const FALLOFF_STOPS = 12;
/** The light maps are redrawn about 15 times a second: flicker is slow, and a frame is not. */
export const FLICKER_INTERVAL_MS = 66;

/** The ADR's budget for the lighting pass, per frame. */
export const LIGHTING_BUDGET_MS = 2;
/** Rebuilds in a row over budget before giving something up: one slow frame is no trend. */
export const OVER_BUDGET_LIMIT = 30;
/**
 * A light in a tunnel adds a warm pool over the lit floor (#3350), this
 * much of its intensity at the heart, and never more than the cap: the
 * floor's colours lift past their lighting-off tone without clipping to white.
 */
export const TUNNEL_GLOW = 0.5;
export const TUNNEL_GLOW_CAP = 0.3;

/** What a light of `intensity` on a tunnel's layer adds at the heart of its pool (#3350), 0 to 1. */
export function tunnelGlow(intensity: number): number {
  return Math.min(Math.max(intensity, 0) * TUNNEL_GLOW, TUNNEL_GLOW_CAP);
}

/** Whether `layer` is the tunnels' (#3350): its lights add a warm pool too. */
export function glowsOn(structure: MapStructure, layer: number): boolean {
  return structure.tunnels.length > 0 && layer === structure.ground - 1;
}

/** What the budget still allows, best first. */
export type LightingStage = "full" | "no-flicker" | "no-shadows" | "flat";

export type LightsOf = MapLighting["lights"][number];

/** The next stage down the ADR's degrade order. */
function degraded(stage: LightingStage): LightingStage {
  switch (stage) {
    case "full":
      return "no-flicker";
    case "no-flicker":
      return "no-shadows";
    case "no-shadows":
    case "flat":
      return "flat";
  }
}

/** What is shown: reduced motion holds every light steady, as the budget's no-flicker does. */
export function shownStage(budget: LightingStage, reducedMotion: boolean): LightingStage {
  return reducedMotion && budget === "full" ? "no-flicker" : budget;
}

/**
 * Steps down the degrade order when the pass stays over budget. A
 * flicker redraw is timed, and so is a shadow rebuild (#2988): a map
 * rebuilt slowly again and again, as on a context lost and restored, ends
 * without its shadows, then flat.
 */
export class LightingBudget {
  public stage: LightingStage = "full";
  private over = 0;

  public record(milliseconds: number): void {
    this.over = milliseconds > LIGHTING_BUDGET_MS ? this.over + 1 : 0;
    if (this.over >= OVER_BUDGET_LIMIT) {
      this.stage = degraded(this.stage);
      this.over = 0;
    }
  }
}

/** A layer's lights, split into what is drawn once and what is redrawn. */
export function lightsByStability(
  lighting: MapLighting,
  layer: number,
  stage: LightingStage,
): { readonly steady: readonly LightsOf[]; readonly flickering: readonly LightsOf[] } {
  const own = lighting.lights.filter((light) => light.layer === layer);
  if (stage !== "full") {
    return { steady: own, flickering: [] };
  }
  return {
    steady: own.filter((light) => light.flicker === 0),
    flickering: own.filter((light) => light.flicker > 0),
  };
}

/** Whether a layer's light map is due a redraw at `nowMs`. */
export function flickerRedrawDue(
  flickering: readonly LightsOf[],
  lastMs: number,
  nowMs: number,
): boolean {
  return flickering.length > 0 && nowMs - lastMs >= FLICKER_INTERVAL_MS;
}

/** Whether `stage` draws shadows (#2988). */
export function stageShadows(stage: LightingStage): boolean {
  return stage === "full" || stage === "no-flicker";
}

/** What the ambient alone leaves outdoors, where a sun shadow falls (#2988). */
export function sunShadowTint(lighting: MapLighting): number {
  return baseTint({ ...lighting, sun: undefined }, false);
}

/** What the ambient and the sun leave on a surface, indoors or out, as a colour to multiply by. */
export function baseTint(lighting: MapLighting, indoors: boolean): number {
  const open: MapLighting = indoors
    ? { ...lighting, ambient: lighting.indoorAmbient, indoor: [], lights: [], sun: undefined }
    : { ...lighting, indoor: [], lights: [] };
  return tintOf(lightAt(open, { x: 0, y: 0 }, 0, 0, SURFACE_LIGHT_FLOOR));
}

function shapeCentre(shape: RenderableShape): Vec2 {
  if (shape.kind === "rect") {
    return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  }
  const sum = shape.points.reduce((all, p) => ({ x: all.x + p.x, y: all.y + p.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / shape.points.length, y: sum.y / shape.points.length };
}

/**
 * The colours of what stands off the floor, lit where `shape` stands. A
 * wall can draw over a body of its own layer, so no light map can cover
 * it: it takes its light once, when the map is drawn, steady lights and all.
 */
export function litStructurePalette(
  palette: ArenaPalette,
  lighting: MapLighting | undefined,
  shape: RenderableShape,
  layer: number,
): ArenaPalette {
  if (lighting === undefined) {
    return palette;
  }
  const tint = tintOf(lightAt(lighting, shapeCentre(shape), layer, 0, SURFACE_LIGHT_FLOOR));
  return {
    ...palette,
    wallTop: multiplyColour(palette.wallTop, tint),
    wallFace: multiplyColour(palette.wallFace, tint),
    wallStroke: multiplyColour(palette.wallStroke, tint),
    wallLit: multiplyColour(palette.wallLit, tint),
    support: multiplyColour(palette.support, tint),
    slab: multiplyColour(palette.slab, tint),
  };
}

/**
 * An overhang's colours (#3293), lit where it hangs as a deck of its
 * layer is. It draws over that layer's light map, so it takes its light
 * once, as a wall does.
 */
export function litOverhangColours(
  colours: OverhangLookColours,
  lighting: MapLighting | undefined,
  shape: RenderableShape,
  layer: number,
): OverhangLookColours {
  if (lighting === undefined) {
    return colours;
  }
  const tint = tintOf(lightAt(lighting, shapeCentre(shape), layer, 0, SURFACE_LIGHT_FLOOR));
  return {
    roof: multiplyColour(colours.roof, tint),
    detail: multiplyColour(colours.detail, tint),
    eave: multiplyColour(colours.eave, tint),
  };
}

/** The outlines a layer other than the ground has to light, in that layer's own coordinates. */
export function layerSurfaces(
  structure: MapStructure,
  layer: number,
): readonly (readonly Vec2[])[] {
  const outline = (shape: RenderableShape): readonly Vec2[] =>
    shape.kind === "polygon"
      ? shape.points
      : [
          { x: shape.x, y: shape.y },
          { x: shape.x + shape.width, y: shape.y },
          { x: shape.x + shape.width, y: shape.y + shape.height },
          { x: shape.x, y: shape.y + shape.height },
        ];
  const decks = structure.decks
    .filter((deck) => deck.layer === layer)
    .map((deck) => outline(deck.footprint));
  // A pit's floor is the layer under the ground's, seen through its hole
  // (#2973), and so is a tunnel's, under its cover or through its stairs' (#3329).
  const pits =
    layer === structure.ground - 1
      ? [...structure.pits, ...structure.tunnels].map(({ footprint }) => outline(footprint))
      : [];
  // A ramp's drawn slope is already lifted; the light map is lifted whole.
  // A stair down from the ground stands in its pit or shaft, so it is lit
  // with its floor, not left unlit where the ground's light is cut (#3329).
  const down = (ramp: MapStructure["transitions"][number]): boolean =>
    layer === structure.ground - 1 &&
    Math.min(ramp.from, ramp.to) === layer &&
    Math.max(ramp.from, ramp.to) === structure.ground;
  const ramps = structure.transitions
    .filter((ramp) => ramp.to === layer || down(ramp))
    .map((ramp) =>
      rampDrawing(structure, ramp).slope.map((p) => ({
        x: p.x,
        y: p.y + elevationOf(layer, structure.ground),
      })),
    );
  // A cut-away cover shows each tunnel's far wall over its floor: lit with it (#3329).
  const walls =
    layer === structure.ground - 1
      ? structure.tunnels.flatMap((tunnel) => tunnelFarWall(structure, tunnel))
      : [];
  return [...decks, ...pits, ...ramps, ...walls];
}

/**
 * What of `layer` is under a roof, so no sun reaches it (#3329): on the
 * layer under the ground, each tunnel's floor and far wall but for its
 * shafts, which are open. It takes the indoor ambient, as
 * `lighting.indoor` does, so a torch in it shows its pool.
 */
export function roofedOver(structure: MapStructure, layer: number): readonly (readonly Vec2[])[] {
  return layer === structure.ground - 1
    ? structure.tunnels.flatMap((tunnel) => [
        ...tunnelRoof(structure, tunnel),
        ...tunnelFarWall(structure, tunnel),
      ])
    : [];
}

/** A box of a light map, in its pixels. */
export interface LightMapBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The whole pixels round `points`, scaled to the light map and kept within `within`. */
function pixelBox(points: readonly Vec2[], within: LightMapBox): LightMapBox {
  if (points.length === 0) {
    return { x: within.x, y: within.y, width: 1, height: 1 };
  }
  const xs = points.map(({ x }) => x * LIGHT_MAP_SCALE);
  const ys = points.map(({ y }) => y * LIGHT_MAP_SCALE);
  const left = Math.max(within.x, Math.floor(Math.min(...xs)));
  const top = Math.max(within.y, Math.floor(Math.min(...ys)));
  const right = Math.min(within.x + within.width, Math.ceil(Math.max(...xs)));
  const bottom = Math.min(within.y + within.height, Math.ceil(Math.max(...ys)));
  // A light map is never empty: Phaser makes no texture of no pixels.
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/**
 * What of an arena `width` by `height` the light map of `layer` covers
 * (#3157): the ground all of it, any other layer only the box round its
 * surfaces. Outside them it is erased, so a smaller map shows the same,
 * and costs a frame only the pixels it covers.
 */
export function lightMapExtent(
  structure: MapStructure,
  layer: number,
  width: number,
  height: number,
): LightMapBox {
  const whole = {
    x: 0,
    y: 0,
    width: Math.ceil(width * LIGHT_MAP_SCALE),
    height: Math.ceil(height * LIGHT_MAP_SCALE),
  };
  return layer === structure.ground
    ? whole
    : pixelBox(layerSurfaces(structure, layer).flat(), whole);
}

/**
 * The boxes of a light map with `extent` that are shown (#3162), in its own
 * pixels. Of the ground's, the cells no raised deck stands over: the deck
 * draws over them opaque, so they would be lit for nothing. Of any other
 * layer, only the cells its surfaces are in: elsewhere it is erased. Either
 * way leaving the rest out shows the same, and a deck spread over the
 * arena does not cost a light map a full screen.
 */
export function lightMapCover(
  structure: MapStructure,
  walls: readonly RenderableWall[],
  layer: number,
  extent: LightMapBox,
): readonly LightMapBox[] {
  const inMap = (outline: readonly Vec2[]): readonly Vec2[] =>
    outline.map(({ x, y }) => ({
      x: x * LIGHT_MAP_SCALE - extent.x,
      y: y * LIGHT_MAP_SCALE - extent.y,
    }));
  if (layer === structure.ground) {
    const decks = deckCovers(structure, walls, renderOrder({ kind: "lighting", layer })).map(inMap);
    const tunnels = tunnelLightCover(structure, extent).flatMap(({ boxes }) => boxes);
    return coverBoxes(
      extent.width,
      extent.height,
      LIGHT_MAP_CELL,
      (box) => !decks.some((outline) => boxUnder(outline, box, 2)),
    ).flatMap((box) => boxesWithout(box, tunnels));
  }
  const surfaces = layerSurfaces(structure, layer).map(inMap);
  // A few pixels past each surface, for its smoothed edge.
  return coverBoxes(extent.width, extent.height, LIGHT_MAP_CELL, (box) =>
    surfaces.some((outline) => boxMeets(outline, box, 3)),
  );
}

/**
 * The ground's light map over each tunnel's cover (#3329), in its own
 * pixels: shown on its own, so it fades as the cover is cut away, and the
 * ground's light never falls on the tunnel's floor under it. Its edges are
 * rounded to whole pixels, as `lightMapCover` cuts them out. Where covers
 * overlap, at a junction, the earlier tunnel owns the shared corner, so
 * the light there is multiplied in once, not twice.
 */
export function tunnelLightCover(
  structure: MapStructure,
  extent: LightMapBox,
): readonly { readonly tunnel: number; readonly boxes: readonly LightMapBox[] }[] {
  const owned: LightMapBox[] = [];
  return structure.tunnels.flatMap((tunnel, at) => {
    const cover = tunnelCoverBox(structure, tunnel);
    const left = Math.max(0, Math.round(cover.left * LIGHT_MAP_SCALE) - extent.x);
    const top = Math.max(0, Math.round(cover.top * LIGHT_MAP_SCALE) - extent.y);
    const right = Math.min(extent.width, Math.round(cover.right * LIGHT_MAP_SCALE) - extent.x);
    const bottom = Math.min(extent.height, Math.round(cover.bottom * LIGHT_MAP_SCALE) - extent.y);
    if (right <= left || bottom <= top) {
      return [];
    }
    const box = { x: left, y: top, width: right - left, height: bottom - top };
    const boxes = boxesWithout(box, owned);
    owned.push(box);
    return boxes.length > 0 ? [{ tunnel: at, boxes }] : [];
  });
}

/** `box` with each of `holes` cut out, as the boxes left: up to four round each hole. */
function boxesWithout(box: LightMapBox, holes: readonly LightMapBox[]): LightMapBox[] {
  return holes.reduce<LightMapBox[]>(
    (pieces, hole) =>
      pieces.flatMap((piece) => {
        if (!overlaps(piece, hole)) {
          return [piece];
        }
        const top = Math.max(piece.y, hole.y);
        const bottom = Math.min(piece.y + piece.height, hole.y + hole.height);
        const left = Math.max(piece.x, hole.x);
        const right = Math.min(piece.x + piece.width, hole.x + hole.width);
        return [
          { ...piece, height: top - piece.y },
          { ...piece, y: bottom, height: piece.y + piece.height - bottom },
          { x: piece.x, y: top, width: left - piece.x, height: bottom - top },
          { x: right, y: top, width: piece.x + piece.width - right, height: bottom - top },
        ].filter(({ width, height }) => width > 0 && height > 0);
      }),
    [box],
  );
}

/** Some flickering lights, and the box round them that a flicker redraws. */
export interface FlickerRegion {
  readonly box: LightMapBox;
  readonly lights: readonly LightsOf[];
}

function overlaps(a: LightMapBox, b: LightMapBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** How far past a stamp or an outline, in light map pixels, its smoothing may colour (#3524). */
const MARK_MARGIN = 2;

/** How a light map's cover is shown (#3524), in its own pixels. */
export interface LightMapCells {
  /** Where the map is its plain outdoor tint, and nothing draws it but a flat fill. */
  readonly flat: readonly LightMapBox[];
  /** Wholly in a sun shadow no light reaches: its tint, flat (#3660). */
  readonly shaded: readonly LightMapBox[];
  /** Wholly indoors or roofed, where no light reaches: the indoor tint, flat (#3660). */
  readonly indoors: readonly LightMapBox[];
  /**
   * On a layer other than the ground, a cell nothing marks that one
   * surface's edge crosses: the convex piece of that surface in the cell,
   * in the map's pixels, drawn as a flat fill too (#3660). The rest of the
   * cell is erased.
   */
  readonly edges: readonly (readonly Vec2[])[];
  /** Where light varies, shown from the light map's texture. */
  readonly textured: readonly LightMapBox[];
  /** Where a light reaches, so the warm pools are not black (#3350). */
  readonly lit: readonly LightMapBox[];
}

/**
 * The cover of `layer`'s light map with `extent`, cut into cells of
 * `LIGHT_MAP_CELL` (#3524). On a software renderer a textured pixel
 * costs many flat ones, and far from every light the map is one colour:
 * a cell nothing marks but the base tint is drawn as a flat fill, and so
 * is one wholly in a sun shadow or wholly indoors, each painted one colour
 * over the base. What
 * marks a cell is decided from the same shapes the map is drawn from,
 * grown by `MARK_MARGIN`: a light's reach, by its box, steady or
 * flickering (so nothing redrawn after the build lands in a flat cell),
 * and, by their outlines (#3660), a sun shadow, the indoors, a roof, and
 * the edge of what is erased.
 * In doubt, a cell is textured.
 */
export function lightMapCells(
  lighting: MapLighting,
  structure: MapStructure,
  walls: readonly RenderableWall[],
  layer: number,
  extent: LightMapBox,
  stage: LightingStage,
): LightMapCells {
  const inMap = (outline: readonly Vec2[]): readonly Vec2[] =>
    outline.map(({ x, y }) => ({
      x: x * LIGHT_MAP_SCALE - extent.x,
      y: y * LIGHT_MAP_SCALE - extent.y,
    }));
  const boxOf = (outline: readonly Vec2[]): LightMapBox => {
    const xs = outline.map(({ x }) => x);
    const ys = outline.map(({ y }) => y);
    const left = Math.floor(Math.min(...xs)) - MARK_MARGIN;
    const top = Math.floor(Math.min(...ys)) - MARK_MARGIN;
    return {
      x: left,
      y: top,
      width: Math.ceil(Math.max(...xs)) + MARK_MARGIN - left,
      height: Math.ceil(Math.max(...ys)) + MARK_MARGIN - top,
    };
  };
  const { steady, flickering } = lightsByStability(lighting, layer, stage);
  const reach = [...steady, ...flickering].map(({ position, radius }) =>
    boxOf(
      inMap([
        { x: position.x - radius, y: position.y - radius },
        { x: position.x + radius, y: position.y + radius },
      ]),
    ),
  );
  const casters = stageShadows(stage) ? shadowCasters(walls, structure, layer) : [];
  const ground = layer === structure.ground;
  const marks = (outlines: readonly (readonly Vec2[])[]) =>
    outlines
      .filter((outline) => outline.length > 0)
      .map((shape) => {
        const outline = inMap(shape);
        return { outline, box: boxOf(outline) };
      });
  const sun = marks(layerSunShadows(lighting, casters));
  const inside = marks([...lighting.indoor.map(shapeOutline), ...roofedOver(structure, layer)]);
  // The ground's pits are erased; the rest is erased off any other layer.
  const holes = marks(ground ? groundHoles(structure) : []);
  const shapes = [...sun, ...inside, ...holes];
  const surfaces = ground ? [] : layerSurfaces(structure, layer).map(inMap);
  // A shape marks only the cells it meets, not all its box does (#3660): a
  // long shadow across the map has a box of half of it.
  type Shape = (typeof shapes)[number];
  const meets = (box: LightMapBox) => (shape: Shape) =>
    overlaps(shape.box, box) && boxMeets(shape.outline, box, MARK_MARGIN);
  const under = (box: LightMapBox) => (shape: Shape) =>
    overlaps(shape.box, box) && boxUnder(shape.outline, box, MARK_MARGIN);
  const unlit = (box: LightMapBox): boolean => !reach.some((mark) => overlaps(mark, box));
  const unmarked = (box: LightMapBox): boolean => unlit(box) && !shapes.some(meets(box));
  const onSurface = (box: LightMapBox): boolean =>
    ground || surfaces.some((outline) => boxUnder(outline, box, MARK_MARGIN));
  const plain = (box: LightMapBox): boolean => unmarked(box) && onSurface(box);
  // The indoors is painted over the sun's shadows, each one colour.
  const indoorsOnly = (box: LightMapBox): boolean =>
    unlit(box) && onSurface(box) && !holes.some(meets(box)) && inside.some(under(box));
  const shadedOnly = (box: LightMapBox): boolean =>
    unlit(box) &&
    onSurface(box) &&
    !holes.some(meets(box)) &&
    !inside.some(meets(box)) &&
    sun.some(under(box));
  const flatOnly = (box: LightMapBox): boolean => plain(box) || indoorsOnly(box) || shadedOnly(box);
  // Two surfaces in one cell would multiply twice where they overlap, and
  // a clip of a concave one is only one piece when it comes out convex.
  const edgeOf = (box: LightMapBox): readonly Vec2[] | undefined => {
    if (ground || !unmarked(box)) {
      return undefined;
    }
    const meeting = surfaces.filter((outline) => boxMeets(outline, box, MARK_MARGIN));
    const [only] = meeting;
    if (meeting.length !== 1 || only === undefined) {
      return undefined;
    }
    const piece = clipConvex(only, box);
    return convex(piece) ? piece : undefined;
  };
  const split = (box: LightMapBox, shows: (cell: LightMapBox) => boolean): readonly LightMapBox[] =>
    coverBoxes(box.width, box.height, LIGHT_MAP_CELL, (cell) =>
      shows({ ...cell, x: box.x + cell.x, y: box.y + cell.y }),
    ).map((cell) => ({ ...cell, x: box.x + cell.x, y: box.y + cell.y }));
  const cover = lightMapCover(structure, walls, layer, extent);
  const edges = cover.flatMap((box) =>
    split(box, (cell) => !flatOnly(cell) && edgeOf(cell) !== undefined).flatMap((merged) =>
      coverBoxes(merged.width, merged.height, LIGHT_MAP_CELL, () => true).flatMap((cell) => {
        const at = { ...cell, x: merged.x + cell.x, y: merged.y + cell.y };
        const piece = edgeOf(at) ?? [];
        return piece.length < 3 ? [] : [piece];
      }),
    ),
  );
  return {
    flat: cover.flatMap((box) => split(box, plain)),
    shaded: cover.flatMap((box) => split(box, shadedOnly)),
    indoors: cover.flatMap((box) => split(box, indoorsOnly)),
    edges,
    textured: cover.flatMap((box) =>
      split(box, (cell) => !flatOnly(cell) && edgeOf(cell) === undefined),
    ),
    lit: cover.flatMap((box) => split(box, (cell) => reach.some((mark) => overlaps(mark, cell)))),
  };
}

/** Whether `outline` turns one way only: one convex piece. */
function convex(outline: readonly Vec2[]): boolean {
  let turn = 0;
  return outline.every((a, k) => {
    const b = outline[(k + 1) % outline.length] ?? a;
    const c = outline[(k + 2) % outline.length] ?? a;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) {
      return true;
    }
    if (turn === 0) {
      turn = Math.sign(cross);
    }
    return Math.sign(cross) === turn;
  });
}

/**
 * What a flicker redraws of a light map with `extent` (#3157, #3254): a box
 * round each group of flickering lights whose reach overlaps, in the map's
 * own pixels, so lights far apart do not redraw the dark between them. The
 * boxes never overlap: a redraw of one clears nothing another drew. The
 * rest holds the steady lights, which never change.
 */
export function flickerRegions(
  flickering: readonly LightsOf[],
  extent: LightMapBox,
): readonly FlickerRegion[] {
  const boxOf = (lights: readonly LightsOf[]): LightMapBox => {
    const reach = lights.flatMap(({ position, radius }) => [
      { x: position.x - radius, y: position.y - radius },
      { x: position.x + radius, y: position.y + radius },
    ]);
    const box = pixelBox(reach, extent);
    return { ...box, x: box.x - extent.x, y: box.y - extent.y };
  };
  let regions: FlickerRegion[] = flickering.map((light) => ({
    box: boxOf([light]),
    lights: [light],
  }));
  // A merged box can reach a third one, so merge until none overlap.
  for (let merged = true; merged;) {
    merged = false;
    const next: FlickerRegion[] = [];
    for (const region of regions) {
      const into = next.findIndex(({ box }) => overlaps(box, region.box));
      const other = next[into];
      if (other === undefined) {
        next.push(region);
      } else {
        const lights = [...other.lights, ...region.lights];
        next[into] = { box: boxOf(lights), lights };
        merged = true;
      }
    }
    regions = next;
  }
  return regions;
}

/**
 * Of `regions` of a light map with `extent`, drawn `lift` world units up,
 * those the camera's `view` meets (#3499). One off screen keeps its last
 * flicker until it is next due in view: nobody sees it stand still.
 */
export function regionsInView(
  regions: readonly FlickerRegion[],
  extent: LightMapBox,
  lift: number,
  view: Box,
): readonly FlickerRegion[] {
  return regions.filter(({ box }) => boxInView(box, extent, lift, view));
}

/**
 * Whether `box` of a light map with `extent`, drawn `lift` world units up,
 * meets the camera's `view`. An image of it off screen is hidden (#3660):
 * a software renderer pays for every quad it is handed, shown or not.
 */
export function boxInView(box: LightMapBox, extent: LightMapBox, lift: number, view: Box): boolean {
  const left = view.left * LIGHT_MAP_SCALE - extent.x;
  const top = (view.top + lift) * LIGHT_MAP_SCALE - extent.y;
  const right = view.right * LIGHT_MAP_SCALE - extent.x;
  const bottom = (view.bottom + lift) * LIGHT_MAP_SCALE - extent.y;
  return box.x < right && left < box.x + box.width && box.y < bottom && top < box.y + box.height;
}

/**
 * Where the ground's light never falls (#2973): each pit's hole, and each
 * hole stairs cut down into a tunnel (#3329), lit by the layer under it, so
 * a body in one is not lit twice.
 */
export function groundHoles(structure: MapStructure): readonly (readonly Vec2[])[] {
  return [
    ...structure.pits.map((pit) => shapeOutline(pit.footprint)),
    // The stairs down into a tunnel go through the ground (#3329).
    ...structure.tunnels.flatMap((tunnel) => tunnelOpenings(structure, tunnel)),
  ];
}

interface LayerMap {
  readonly layer: number;
  readonly baseKey: string;
  readonly base: Phaser.Textures.DynamicTexture;
  readonly shownKey: string;
  readonly shown: Phaser.Textures.DynamicTexture;
  /** The map shown, one image per box of it a surface is in (#3162), with its box. */
  readonly images: readonly {
    readonly image: Phaser.GameObjects.Image;
    readonly box: LightMapBox;
  }[];
  /** The map where it is one colour, as a flat fill (#3524). */
  readonly flat: Phaser.GameObjects.Graphics;
  /** Of the ground's, the images over each tunnel's cover, by tunnel (#3329). */
  readonly tunnels: ReadonlyMap<number, readonly Phaser.GameObjects.Image[]>;
  readonly outsideKey: string | undefined;
  /** Of the tunnels' layer, the warm pools its lights add (#3350); none elsewhere. */
  readonly glowKey: string | undefined;
  /** What of the arena it covers, in light map pixels. */
  readonly extent: LightMapBox;
  /** How far up, in world units, its images are drawn. */
  readonly lift: number;
  readonly flickering: readonly LightsOf[];
  /** What a flicker redraws, in its own pixels; none when nothing flickers. */
  readonly flickerRegions: readonly FlickerRegion[];
  /** Each light whose shadows were cut from its own texture, by light id (#2988). */
  readonly shadowed: ReadonlyMap<string, string>;
  drawnAt: number;
}

let nextLightingId = 0;

/** One scene's light maps; empty on a map that is not lit. */
export class LightingPass {
  private lighting: MapLighting | undefined;
  private structure: MapStructure | undefined;
  private walls: readonly RenderableWall[] = [];
  private layers: LayerMap[] = [];
  private width = 0;
  private height = 0;
  private stage: LightingStage = "full";
  private readonly budget = new LightingBudget();
  private readonly rebuild = (): void => {
    this.build();
  };

  private readonly scene: Phaser.Scene;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.game.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.rebuild);
  }

  /** The lighting the budget still allows of `lighting`. */
  public allowed(lighting: MapLighting | undefined): MapLighting | undefined {
    return this.budget.stage === "flat" ? undefined : lighting;
  }

  /** Whether `lighting` is what is shown; builds or drops the maps when it is not. */
  public show(
    lighting: MapLighting | undefined,
    structure: MapStructure,
    walls: readonly RenderableWall[],
    width: number,
    height: number,
    reducedMotion: boolean,
  ): void {
    const stage = shownStage(this.budget.stage, reducedMotion);
    if (
      lighting === this.lighting &&
      structure === this.structure &&
      walls === this.walls &&
      width === this.width &&
      height === this.height &&
      stage === this.stage
    ) {
      return;
    }
    this.lighting = lighting;
    this.structure = structure;
    this.walls = walls;
    this.width = width;
    this.height = height;
    this.stage = stage;
    this.build();
  }

  /** Whether the lights shown flicker: bodies are lit the same way as the maps. */
  public get flickers(): boolean {
    return this.stage === "full";
  }

  /** Whether the maps shown carry shadows: the scene drops its fixed deck shadow when they do. */
  public get shadows(): boolean {
    return this.lighting !== undefined && stageShadows(this.stage);
  }

  /**
   * Fades the ground's light over tunnel `at` to `alpha`, its cover's
   * (#3329): cut away, the cover no longer stands between the tunnel and
   * the eye, and nor does the light that falls on it.
   */
  public fadeTunnel(at: number, alpha: number): void {
    for (const map of this.layers) {
      for (const image of map.tunnels.get(at) ?? []) {
        image.setAlpha(alpha);
      }
    }
  }

  /** Shows what of the maps the camera's `view` meets; redraws what flickers in it, when due. */
  public update(nowMs: number, view: Box): void {
    for (const map of this.layers) {
      for (const { image, box } of map.images) {
        image.setVisible(boxInView(box, map.extent, map.lift, view));
      }
      if (flickerRedrawDue(map.flickering, map.drawnAt, nowMs)) {
        const started = performance.now();
        this.drawFlicker(map, nowMs, regionsInView(map.flickerRegions, map.extent, map.lift, view));
        this.budget.record(performance.now() - started);
      }
    }
  }

  public destroy(): void {
    this.scene.game.renderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.rebuild);
    this.drop();
  }

  private drop(): void {
    const textures = this.scene.textures;
    for (const map of this.layers) {
      for (const { image } of map.images) {
        image.destroy();
      }
      map.flat.destroy();
      for (const key of [
        map.baseKey,
        map.shownKey,
        map.outsideKey,
        map.glowKey,
        ...map.shadowed.values(),
      ]) {
        if (key !== undefined && textures.exists(key)) {
          textures.remove(key);
        }
      }
    }
    this.layers = [];
  }

  private build(): void {
    this.drop();
    const { lighting, structure } = this;
    if (lighting === undefined || structure === undefined) {
      return;
    }
    this.ensureFalloff();
    const started = performance.now();
    for (let layer = 0; layer < structure.layerCount; layer += 1) {
      this.layers.push(this.buildLayer(lighting, structure, layer));
    }
    if (stageShadows(this.stage)) {
      this.budget.record(performance.now() - started);
    }
  }

  private ensureFalloff(): void {
    const textures = this.scene.textures;
    if (textures.exists(FALLOFF_TEXTURE)) {
      return;
    }
    const canvas = textures.createCanvas(FALLOFF_TEXTURE, FALLOFF_SIZE, FALLOFF_SIZE);
    if (canvas === null) {
      return;
    }
    const middle = FALLOFF_SIZE / 2;
    const gradient = canvas.context.createRadialGradient(middle, middle, 0, middle, middle, middle);
    for (let stop = 0; stop <= FALLOFF_STOPS; stop += 1) {
      const along = stop / FALLOFF_STOPS;
      gradient.addColorStop(along, `rgba(255,255,255,${String((1 - along) ** 2)})`);
    }
    canvas.context.fillStyle = gradient;
    canvas.context.fillRect(0, 0, FALLOFF_SIZE, FALLOFF_SIZE);
    canvas.refresh();
  }

  private buildLayer(lighting: MapLighting, structure: MapStructure, layer: number): LayerMap {
    const textures = this.scene.textures;
    const extent = lightMapExtent(structure, layer, this.width, this.height);
    const { width, height } = extent;
    nextLightingId += 1;
    const baseKey = `lighting-${String(nextLightingId)}-base`;
    const shownKey = `lighting-${String(nextLightingId)}-shown`;
    const base = textures.addDynamicTexture(baseKey, width, height);
    const shown = textures.addDynamicTexture(shownKey, width, height);
    if (base === null || shown === null) {
      throw new Error("lighting: could not create a light map");
    }
    const outsideKey = this.buildOutside(
      `lighting-${String(nextLightingId)}-outside`,
      structure,
      layer,
      extent,
    );
    const { steady, flickering } = lightsByStability(lighting, layer, this.stage);
    const casters = stageShadows(this.stage) ? shadowCasters(this.walls, structure, layer) : [];

    base.fill(baseTint(lighting, false), 1);
    // A draw is queued until `base.render()`, so its painters live until then.
    const painters: Phaser.GameObjects.Graphics[] = [];
    // The sun's shadows, then the indoors over them: indoors has no sun to lose.
    const sunShadows = layerSunShadows(lighting, casters);
    if (sunShadows.length > 0) {
      const painter = this.scene.make.graphics({}, false);
      painter.fillStyle(sunShadowTint(lighting), 1);
      for (const outline of sunShadows) {
        fillOutline(painter, outline, 0, 0);
      }
      painter.setScale(LIGHT_MAP_SCALE);
      base.draw(painter, -extent.x, -extent.y);
      painters.push(painter);
    }
    const roofed = roofedOver(structure, layer);
    if (lighting.indoor.length > 0 || roofed.length > 0) {
      const painter = this.scene.make.graphics({}, false);
      painter.fillStyle(baseTint(lighting, true), 1);
      for (const shape of lighting.indoor) {
        fillShape(painter, shape);
      }
      for (const outline of roofed) {
        fillOutline(painter, outline, 0, 0);
      }
      painter.setScale(LIGHT_MAP_SCALE);
      base.draw(painter, -extent.x, -extent.y);
      painters.push(painter);
    }
    const shadowed = new Map<string, string>();
    for (const light of [...steady, ...flickering]) {
      const shadows = layerLightShadows(light, casters);
      if (shadows.length > 0) {
        shadowed.set(light.id, this.buildShadowedLight(`${baseKey}-${light.id}`, light, shadows));
      }
    }
    for (const light of steady) {
      this.stampLight(base, extent, light, light.intensity, shadowed.get(light.id));
    }
    if (outsideKey !== undefined) {
      // A texture drawn by key is centred on the point given.
      base.erase(outsideKey, base.width / 2, base.height / 2);
    }
    base.render();
    for (const painter of painters) {
      painter.destroy();
    }

    const glowKey = glowsOn(structure, layer)
      ? this.buildGlow(
          `lighting-${String(nextLightingId)}-glow`,
          extent,
          [...steady, ...flickering],
          shadowed,
          outsideKey,
        )
      : undefined;

    const lift = elevationOf(layer, structure.ground);
    const shownImages: { image: Phaser.GameObjects.Image; box: LightMapBox }[] = [];
    const imageOf =
      (key: string, blendMode: Phaser.BlendModes) =>
      (box: LightMapBox): Phaser.GameObjects.Image => {
        const { x, y, width, height } = box;
        const image = this.scene.add
          .image(
            (extent.x + x) / LIGHT_MAP_SCALE,
            (extent.y + y) / LIGHT_MAP_SCALE - lift,
            key,
            this.region(key, x, y, width, height),
          )
          .setOrigin(0, 0)
          .setScale(1 / LIGHT_MAP_SCALE)
          .setBlendMode(blendMode)
          .setDepth(renderOrder({ kind: "lighting", layer }));
        shownImages.push({ image, box });
        return image;
      };
    const image = imageOf(shownKey, Phaser.BlendModes.MULTIPLY);
    const cells = lightMapCells(lighting, structure, this.walls, layer, extent, this.stage);
    // Where the map is one colour, that colour multiplied flat, untextured (#3524).
    const flat = this.scene.add
      .graphics()
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(renderOrder({ kind: "lighting", layer }));
    const fillCells = (boxes: readonly LightMapBox[], tint: number): void => {
      flat.fillStyle(tint, 1);
      for (const { x, y, width, height } of boxes) {
        flat.fillRect(
          (extent.x + x) / LIGHT_MAP_SCALE,
          (extent.y + y) / LIGHT_MAP_SCALE - lift,
          width / LIGHT_MAP_SCALE,
          height / LIGHT_MAP_SCALE,
        );
      }
    };
    fillCells(cells.shaded, sunShadowTint(lighting));
    fillCells(cells.indoors, baseTint(lighting, true));
    fillCells(cells.flat, baseTint(lighting, false));
    for (const piece of cells.edges) {
      fillOutline(
        flat,
        piece.map(({ x, y }) => ({
          x: (extent.x + x) / LIGHT_MAP_SCALE,
          y: (extent.y + y) / LIGHT_MAP_SCALE,
        })),
        0,
        -lift,
      );
    }
    // The warm pools add over the lit floor, so they are made after it (#3350);
    // where no light reaches they are black, and add nothing.
    cells.textured.forEach(image);
    if (glowKey !== undefined) {
      cells.lit.forEach(imageOf(glowKey, Phaser.BlendModes.ADD));
    }
    // The ground's light over a tunnel fades with its cover (#3329).
    const tunnels = new Map(
      layer === structure.ground
        ? tunnelLightCover(structure, extent).map(({ tunnel, boxes }) => [tunnel, boxes.map(image)])
        : [],
    );
    const map: LayerMap = {
      layer,
      baseKey,
      base,
      shownKey,
      shown,
      images: shownImages,
      flat,
      tunnels,
      outsideKey,
      glowKey,
      extent,
      lift,
      flickering,
      flickerRegions: flickerRegions(flickering, extent),
      shadowed,
      drawnAt: Number.NEGATIVE_INFINITY,
    };
    this.drawFlicker(map, 0);
    return map;
  }

  /**
   * A texture opaque where `layer`'s light does not fall: everywhere but
   * its surfaces, or, on the ground, its pits' holes. Erasing it leaves
   * only the rest lit; none on a ground with no pits.
   */
  private buildOutside(
    key: string,
    structure: MapStructure,
    layer: number,
    extent: LightMapBox,
  ): string | undefined {
    const { width, height } = extent;
    const ground = layer === structure.ground;
    const outlines = ground ? groundHoles(structure) : layerSurfaces(structure, layer);
    if (ground && outlines.length === 0) {
      return undefined;
    }
    const canvas = this.scene.textures.createCanvas(key, width, height);
    if (canvas === null) {
      throw new Error("lighting: could not create a layer mask");
    }
    const context = canvas.context;
    context.fillStyle = "#fff";
    if (!ground) {
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "destination-out";
    }
    for (const outline of outlines) {
      context.beginPath();
      outline.forEach((point, index) => {
        const x = point.x * LIGHT_MAP_SCALE - extent.x;
        const y = point.y * LIGHT_MAP_SCALE - extent.y;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.closePath();
      context.fill();
    }
    canvas.refresh();
    return key;
  }

  /**
   * `light` at full intensity on a texture of its own, its `shadows` cut
   * out (#2988): built once per map, stamped as the plain falloff is.
   */
  private buildShadowedLight(key: string, light: LightsOf, shadows: readonly Outline[]): string {
    const size = Math.ceil(light.radius * 2 * LIGHT_MAP_SCALE);
    const texture = this.scene.textures.addDynamicTexture(key, size, size);
    if (texture === null) {
      throw new Error("lighting: could not create a shadowed light");
    }
    texture.stamp(FALLOFF_TEXTURE, undefined, size / 2, size / 2, {
      tint: light.colour,
      scale: size / FALLOFF_SIZE,
    });
    const painter = this.scene.make.graphics({}, false);
    painter.fillStyle(0xffffff, 1);
    // World units round the light, then scaled: its centre is the texture's.
    const dx = size / 2 / LIGHT_MAP_SCALE - light.position.x;
    const dy = size / 2 / LIGHT_MAP_SCALE - light.position.y;
    for (const outline of shadows) {
      fillOutline(painter, outline, dx, dy);
    }
    painter.setScale(LIGHT_MAP_SCALE);
    texture.erase(painter);
    texture.render();
    painter.destroy();
    return key;
  }

  /**
   * The warm pools `lights` add on the tunnels' layer (#3350): black but
   * for each light at `tunnelGlow` of its intensity, drawn adding over
   * the lit floor, so a torch lifts it past its lighting-off tone. Steady:
   * a pool does not flicker.
   */
  private buildGlow(
    key: string,
    extent: LightMapBox,
    lights: readonly LightsOf[],
    shadowed: ReadonlyMap<string, string>,
    outsideKey: string | undefined,
  ): string {
    const glow = this.scene.textures.addDynamicTexture(key, extent.width, extent.height);
    if (glow === null) {
      throw new Error("lighting: could not create a tunnel's glow");
    }
    glow.fill(0x000000, 1);
    for (const light of lights) {
      this.stampLight(glow, extent, light, tunnelGlow(light.intensity), shadowed.get(light.id));
    }
    if (outsideKey !== undefined) {
      glow.erase(outsideKey, glow.width / 2, glow.height / 2);
    }
    glow.render();
    return key;
  }

  /** `light` added to `target`: its shadowed texture when it has one, the plain falloff when not. */
  private stampLight(
    target: Phaser.Textures.DynamicTexture,
    extent: LightMapBox,
    light: LightsOf,
    intensity: number,
    shadowedKey: string | undefined,
  ): void {
    const x = light.position.x * LIGHT_MAP_SCALE - extent.x;
    const y = light.position.y * LIGHT_MAP_SCALE - extent.y;
    if (shadowedKey !== undefined) {
      target.stamp(shadowedKey, undefined, x, y, {
        alpha: intensity,
        blendMode: Phaser.BlendModes.ADD,
      });
      return;
    }
    target.stamp(FALLOFF_TEXTURE, undefined, x, y, {
      alpha: intensity,
      tint: light.colour,
      scale: (light.radius * 2 * LIGHT_MAP_SCALE) / FALLOFF_SIZE,
      blendMode: Phaser.BlendModes.ADD,
    });
  }

  /**
   * The steady map, plus each flickering light as it is now: all of it the
   * first time, then only each of `regions`, where its lights reach (#3157,
   * #3254). The regions never overlap, so each step is done for all of them
   * before the next: every change of step ends a draw on the light map,
   * which a software renderer pays for in full (#3499).
   */
  private drawFlicker(
    map: LayerMap,
    nowMs: number,
    regions: readonly FlickerRegion[] = [
      { box: { ...map.extent, x: 0, y: 0 }, lights: map.flickering },
    ],
  ): void {
    const centre = ({ x, y, width, height }: LightMapBox): Vec2 => ({
      x: x + width / 2,
      y: y + height / 2,
    });
    for (const { box } of regions) {
      map.shown.clear(box.x, box.y, box.width, box.height);
    }
    for (const { box } of regions) {
      const { x, y } = centre(box);
      map.shown.stamp(
        map.baseKey,
        this.region(map.baseKey, box.x, box.y, box.width, box.height),
        x,
        y,
      );
    }
    for (const { lights } of regions) {
      for (const light of lights) {
        this.stampLight(
          map.shown,
          map.extent,
          light,
          light.intensity * flickerAt(light.id, light.flicker, nowMs),
          map.shadowed.get(light.id),
        );
      }
    }
    const { outsideKey } = map;
    if (outsideKey !== undefined) {
      for (const { box, lights } of regions) {
        if (lights.length === 0) {
          continue;
        }
        const { x, y } = centre(box);
        map.shown.erase(
          this.scene.textures.getFrame(
            outsideKey,
            this.region(outsideKey, box.x, box.y, box.width, box.height),
          ),
          x,
          y,
        );
      }
    }
    map.shown.render();
    map.drawnAt = nowMs;
  }

  /** The frame of texture `key` that is the box given, made the first time it is asked for. */
  private region(key: string, x: number, y: number, width: number, height: number): string {
    const name = `${String(x)},${String(y)},${String(width)},${String(height)}`;
    const texture = this.scene.textures.get(key);
    if (!texture.has(name)) {
      texture.add(name, 0, x, y, width, height);
    }
    return name;
  }
}

function fillOutline(
  painter: Phaser.GameObjects.Graphics,
  outline: Outline,
  dx: number,
  dy: number,
): void {
  painter.fillPoints(
    outline.map((p) => new Phaser.Math.Vector2(p.x + dx, p.y + dy)),
    true,
  );
}

function fillShape(painter: Phaser.GameObjects.Graphics, shape: RenderableShape): void {
  if (shape.kind === "rect") {
    painter.fillRect(shape.x, shape.y, shape.width, shape.height);
    return;
  }
  painter.fillPoints(
    shape.points.map((p) => new Phaser.Math.Vector2(p.x, p.y)),
    true,
  );
}
