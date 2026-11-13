import Phaser from "phaser";

import type { Vec2 } from "@vibewars/game-core";
import type { MapLighting } from "@vibewars/game-maps/schema";

import type { ArenaPalette } from "./arena-palette.js";
import type { MapStructure, RenderableShape, RenderableWall } from "./arena-snapshot.js";
import { boxMeets, boxUnder, coverBoxes } from "./cell-cover.js";
import { deckCovers, rampDrawing, shapeOutline } from "./layer-surfaces.js";
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
  // A pit's floor is the layer under the ground's, seen through its hole (#2973).
  const pits =
    layer === structure.ground - 1 ? structure.pits.map((pit) => outline(pit.footprint)) : [];
  // A ramp's drawn slope is already lifted; the light map is lifted whole.
  const ramps = structure.transitions
    .filter((ramp) => ramp.to === layer)
    .map((ramp) =>
      rampDrawing(structure, ramp).slope.map((p) => ({
        x: p.x,
        y: p.y + elevationOf(layer, structure.ground),
      })),
    );
  return [...decks, ...pits, ...ramps];
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
    return coverBoxes(
      extent.width,
      extent.height,
      LIGHT_MAP_CELL,
      (box) => !decks.some((outline) => boxUnder(outline, box, 2)),
    );
  }
  const surfaces = layerSurfaces(structure, layer).map(inMap);
  // A few pixels past each surface, for its smoothed edge.
  return coverBoxes(extent.width, extent.height, LIGHT_MAP_CELL, (box) =>
    surfaces.some((outline) => boxMeets(outline, box, 3)),
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
 * Where the ground's light never falls (#2973): each pit's hole, lit by
 * the layer under it, so a body in a pit is not lit twice.
 */
export function groundHoles(structure: MapStructure): readonly (readonly Vec2[])[] {
  return structure.pits.map((pit) => shapeOutline(pit.footprint));
}

interface LayerMap {
  readonly layer: number;
  readonly baseKey: string;
  readonly base: Phaser.Textures.DynamicTexture;
  readonly shownKey: string;
  readonly shown: Phaser.Textures.DynamicTexture;
  /** The map shown, one image per box of it a surface is in (#3162). */
  readonly images: readonly Phaser.GameObjects.Image[];
  readonly outsideKey: string | undefined;
  /** What of the arena it covers, in light map pixels. */
  readonly extent: LightMapBox;
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

  /** Redraws what flickers, when it is due. */
  public update(nowMs: number): void {
    for (const map of this.layers) {
      if (flickerRedrawDue(map.flickering, map.drawnAt, nowMs)) {
        const started = performance.now();
        this.drawFlicker(map, nowMs, map.flickerRegions);
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
      for (const image of map.images) {
        image.destroy();
      }
      for (const key of [map.baseKey, map.shownKey, map.outsideKey, ...map.shadowed.values()]) {
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
    if (lighting.indoor.length > 0) {
      const painter = this.scene.make.graphics({}, false);
      painter.fillStyle(baseTint(lighting, true), 1);
      for (const shape of lighting.indoor) {
        fillShape(painter, shape);
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

    const lift = elevationOf(layer, structure.ground);
    const images = lightMapCover(structure, this.walls, layer, extent).map(
      ({ x, y, width, height }) =>
        this.scene.add
          .image(
            (extent.x + x) / LIGHT_MAP_SCALE,
            (extent.y + y) / LIGHT_MAP_SCALE - lift,
            shownKey,
            this.region(shownKey, x, y, width, height),
          )
          .setOrigin(0, 0)
          .setScale(1 / LIGHT_MAP_SCALE)
          .setBlendMode(Phaser.BlendModes.MULTIPLY)
          .setDepth(renderOrder({ kind: "lighting", layer })),
    );
    const map: LayerMap = {
      layer,
      baseKey,
      base,
      shownKey,
      shown,
      images,
      outsideKey,
      extent,
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
   * #3254).
   */
  private drawFlicker(
    map: LayerMap,
    nowMs: number,
    regions: readonly FlickerRegion[] = [
      { box: { ...map.extent, x: 0, y: 0 }, lights: map.flickering },
    ],
  ): void {
    for (const { box, lights } of regions) {
      const { x, y, width, height } = box;
      const centreX = x + width / 2;
      const centreY = y + height / 2;
      map.shown.clear(x, y, width, height);
      map.shown.stamp(map.baseKey, this.region(map.baseKey, x, y, width, height), centreX, centreY);
      for (const light of lights) {
        this.stampLight(
          map.shown,
          map.extent,
          light,
          light.intensity * flickerAt(light.id, light.flicker, nowMs),
          map.shadowed.get(light.id),
        );
      }
      if (map.outsideKey !== undefined && lights.length > 0) {
        map.shown.erase(
          this.scene.textures.getFrame(
            map.outsideKey,
            this.region(map.outsideKey, x, y, width, height),
          ),
          centreX,
          centreY,
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
