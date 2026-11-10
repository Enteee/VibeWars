import Phaser from "phaser";

import type { Vec2 } from "@vibewars/game-core";
import type { MapLighting } from "@vibewars/game-maps/schema";

import type { ArenaPalette } from "./arena-palette.js";
import type { MapStructure, RenderableShape } from "./arena-snapshot.js";
import { rampDrawing } from "./layer-surfaces.js";
import {
  SURFACE_LIGHT_FLOOR,
  flickerAt,
  lightAt,
  multiplyColour,
  tintOf,
} from "./lighting-model.js";
import { elevationOf, renderOrder } from "./render-order.js";

/**
 * The light maps of a lit arena (ADR-0052): per layer, half resolution,
 * multiplied over that layer's surfaces. What can be decided without a
 * renderer is exported as plain functions, for the tests.
 */

/** Half the arena's resolution: a soft falloff gains nothing from more. */
const LIGHT_MAP_SCALE = 0.5;
const FALLOFF_TEXTURE = "lighting-falloff";
const FALLOFF_SIZE = 256;
const FALLOFF_STOPS = 12;
/** The light maps are redrawn about 15 times a second: flicker is slow, and a frame is not. */
export const FLICKER_INTERVAL_MS = 66;

/** The ADR's budget for the lighting pass, per frame. */
export const LIGHTING_BUDGET_MS = 2;
/** Rebuilds in a row over budget before giving something up: one slow frame is no trend. */
export const OVER_BUDGET_LIMIT = 30;

/** What the budget still allows, best first; #2988 puts its shadows between these. */
export type LightingStage = "full" | "no-flicker" | "flat";

export type LightsOf = MapLighting["lights"][number];

/** The next stage down the ADR's degrade order. */
function degraded(stage: LightingStage): LightingStage {
  return stage === "full" ? "no-flicker" : "flat";
}

/** What is shown: reduced motion holds every light steady, as the budget's no-flicker does. */
export function shownStage(budget: LightingStage, reducedMotion: boolean): LightingStage {
  return reducedMotion && budget === "full" ? "no-flicker" : budget;
}

/**
 * Steps down the degrade order when the pass stays over budget. Only a
 * flicker redraw is timed, so today it stops at no-flicker, which redraws
 * nothing per frame; flat waits for #2988's shadows, which are timed too.
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

interface LayerMap {
  readonly layer: number;
  readonly baseKey: string;
  readonly base: Phaser.Textures.DynamicTexture;
  readonly shownKey: string;
  readonly shown: Phaser.Textures.DynamicTexture;
  readonly image: Phaser.GameObjects.Image;
  readonly outsideKey: string | undefined;
  readonly flickering: readonly LightsOf[];
  drawnAt: number;
}

let nextLightingId = 0;

/** One scene's light maps; empty on a map that is not lit. */
export class LightingPass {
  private lighting: MapLighting | undefined;
  private structure: MapStructure | undefined;
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
    width: number,
    height: number,
    reducedMotion: boolean,
  ): void {
    const stage = shownStage(this.budget.stage, reducedMotion);
    if (
      lighting === this.lighting &&
      structure === this.structure &&
      width === this.width &&
      height === this.height &&
      stage === this.stage
    ) {
      return;
    }
    this.lighting = lighting;
    this.structure = structure;
    this.width = width;
    this.height = height;
    this.stage = stage;
    this.build();
  }

  /** Whether the lights shown flicker: bodies are lit the same way as the maps. */
  public get flickers(): boolean {
    return this.stage === "full";
  }

  /** Redraws what flickers, when it is due. */
  public update(nowMs: number): void {
    for (const map of this.layers) {
      if (flickerRedrawDue(map.flickering, map.drawnAt, nowMs)) {
        const started = performance.now();
        this.drawFlicker(map, nowMs);
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
      map.image.destroy();
      for (const key of [map.baseKey, map.shownKey, map.outsideKey]) {
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
    for (let layer = 0; layer < structure.layerCount; layer += 1) {
      this.layers.push(this.buildLayer(lighting, structure, layer));
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
    const width = Math.ceil(this.width * LIGHT_MAP_SCALE);
    const height = Math.ceil(this.height * LIGHT_MAP_SCALE);
    nextLightingId += 1;
    const baseKey = `lighting-${String(nextLightingId)}-base`;
    const shownKey = `lighting-${String(nextLightingId)}-shown`;
    const base = textures.addDynamicTexture(baseKey, width, height);
    const shown = textures.addDynamicTexture(shownKey, width, height);
    if (base === null || shown === null) {
      throw new Error("lighting: could not create a light map");
    }
    const outsideKey =
      layer === structure.ground
        ? undefined
        : this.buildOutside(
            `lighting-${String(nextLightingId)}-outside`,
            structure,
            layer,
            width,
            height,
          );
    const { steady, flickering } = lightsByStability(lighting, layer, this.stage);

    base.fill(baseTint(lighting, false), 1);
    if (lighting.indoor.length > 0) {
      const painter = this.scene.make.graphics({}, false);
      painter.fillStyle(baseTint(lighting, true), 1);
      for (const shape of lighting.indoor) {
        fillShape(painter, shape);
      }
      painter.setScale(LIGHT_MAP_SCALE);
      base.draw(painter);
      painter.destroy();
    }
    for (const light of steady) {
      this.stampLight(base, light, light.intensity);
    }
    if (outsideKey !== undefined) {
      // A texture drawn by key is centred on the point given.
      base.erase(outsideKey, base.width / 2, base.height / 2);
    }
    base.render();

    const image = this.scene.add
      .image(0, -elevationOf(layer, structure.ground), shownKey)
      .setOrigin(0, 0)
      .setScale(1 / LIGHT_MAP_SCALE)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(renderOrder({ kind: "lighting", layer }));
    const map: LayerMap = {
      layer,
      baseKey,
      base,
      shownKey,
      shown,
      image,
      outsideKey,
      flickering,
      drawnAt: Number.NEGATIVE_INFINITY,
    };
    this.drawFlicker(map, 0);
    return map;
  }

  /** A texture opaque everywhere but on the layer's surfaces: erasing it leaves only those lit. */
  private buildOutside(
    key: string,
    structure: MapStructure,
    layer: number,
    width: number,
    height: number,
  ): string {
    const canvas = this.scene.textures.createCanvas(key, width, height);
    if (canvas === null) {
      throw new Error("lighting: could not create a layer mask");
    }
    const context = canvas.context;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "destination-out";
    for (const outline of layerSurfaces(structure, layer)) {
      context.beginPath();
      outline.forEach((point, index) => {
        const x = point.x * LIGHT_MAP_SCALE;
        const y = point.y * LIGHT_MAP_SCALE;
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

  private stampLight(
    target: Phaser.Textures.DynamicTexture,
    light: LightsOf,
    intensity: number,
  ): void {
    target.stamp(
      FALLOFF_TEXTURE,
      undefined,
      light.position.x * LIGHT_MAP_SCALE,
      light.position.y * LIGHT_MAP_SCALE,
      {
        alpha: intensity,
        tint: light.colour,
        scale: (light.radius * 2 * LIGHT_MAP_SCALE) / FALLOFF_SIZE,
        blendMode: Phaser.BlendModes.ADD,
      },
    );
  }

  /** The steady map, plus each flickering light as it is now. */
  private drawFlicker(map: LayerMap, nowMs: number): void {
    map.shown.clear();
    map.shown.draw(map.baseKey, map.shown.width / 2, map.shown.height / 2);
    for (const light of map.flickering) {
      this.stampLight(
        map.shown,
        light,
        light.intensity * flickerAt(light.id, light.flicker, nowMs),
      );
    }
    if (map.outsideKey !== undefined && map.flickering.length > 0) {
      map.shown.erase(map.outsideKey, map.shown.width / 2, map.shown.height / 2);
    }
    map.shown.render();
    map.drawnAt = nowMs;
  }
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
