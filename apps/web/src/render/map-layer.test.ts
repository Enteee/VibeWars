import { describe, expect, it } from "vitest";

import { FLAT_STRUCTURE, type RenderableWall } from "./arena-snapshot.js";
import {
  createCameraRig,
  stepCamera,
  VIEW_STEPS,
  zoomFor,
  type CameraInput,
} from "./camera-rig.js";
import {
  layerZoom,
  mapLayerChanged,
  ZOOM_REDRAW_RATIO,
  ZOOM_SAME_SHARE,
  type MapLayer,
} from "./map-layer.js";

const WALLS: readonly RenderableWall[] = [
  { kind: "rect", layer: 0, x: 10, y: 20, width: 30, height: 40 },
];
const DARK = { colour: 0xffffff, intensity: 0 };
const LIGHTING = { ambient: DARK, indoorAmbient: DARK, indoor: [], lights: [] };
const LAYER: MapLayer = {
  width: 960,
  height: 640,
  walls: WALLS,
  structure: FLAT_STRUCTURE,
  zoom: 0.65,
  lightShadows: false,
};

describe("the arena's map layer (#1353)", () => {
  it("is drawn on the first frame", () => {
    expect(mapLayerChanged(undefined, LAYER)).toBe(true);
  });

  it("is drawn again for another map's decks and ramps", () => {
    expect(
      mapLayerChanged(LAYER, { ...LAYER, structure: { ...FLAT_STRUCTURE, layerCount: 2 } }),
    ).toBe(true);
  });

  it("is not drawn again while the bounds, the wall list and the zoom stay", () => {
    expect(
      mapLayerChanged(LAYER, {
        width: 960,
        height: 640,
        walls: WALLS,
        structure: FLAT_STRUCTURE,
        zoom: 0.65,
        lightShadows: false,
      }),
    ).toBe(false);
  });

  it("is drawn again for a new zoom alone, so its lines stay 1 px (#2393)", () => {
    expect(mapLayerChanged(LAYER, { ...LAYER, zoom: 0.7 })).toBe(true);
  });

  it("is drawn again under new lighting (#2987)", () => {
    const lit = { ...LAYER, lighting: LIGHTING };
    expect(mapLayerChanged(LAYER, lit)).toBe(true);
    expect(mapLayerChanged(lit, { ...lit })).toBe(false);
    expect(mapLayerChanged(lit, { ...lit, lighting: { ...LIGHTING } })).toBe(true);
  });

  it("is drawn again when the light maps start or stop casting shadows (#2988)", () => {
    const lit = { ...LAYER, lighting: LIGHTING };
    expect(mapLayerChanged(lit, { ...lit, lightShadows: true })).toBe(true);
  });

  it("is drawn again for new bounds", () => {
    expect(mapLayerChanged(LAYER, { ...LAYER, width: 2800 })).toBe(true);
    expect(mapLayerChanged(LAYER, { ...LAYER, height: 1800 })).toBe(true);
  });

  it("is drawn again for a new wall list, even one of the same walls", () => {
    expect(mapLayerChanged(LAYER, { ...LAYER, walls: [...WALLS] })).toBe(true);
    expect(mapLayerChanged(LAYER, { ...LAYER, walls: [] })).toBe(true);
  });
});

describe("the zoom the map layer is drawn at (#3545)", () => {
  it("is the camera's on the first frame", () => {
    expect(layerZoom(undefined, 0.8, undefined)).toBe(0.8);
  });

  it("holds the drawn zoom mid-ease", () => {
    expect(layerZoom(1, 1.1, 1.05)).toBe(1);
    expect(layerZoom(1, 0.9, 0.95)).toBe(1);
  });

  it("follows the camera once it drifts past the redraw ratio, either way", () => {
    expect(layerZoom(1, ZOOM_REDRAW_RATIO * 1.01, 1.2)).toBe(ZOOM_REDRAW_RATIO * 1.01);
    expect(layerZoom(1, 0.99 / ZOOM_REDRAW_RATIO, 0.85)).toBe(0.99 / ZOOM_REDRAW_RATIO);
  });

  it("follows the camera once the zoom settles", () => {
    expect(layerZoom(1, 1.1, 1.1)).toBe(1.1);
    expect(layerZoom(1, 1.1, 1.1 - 1e-4)).toBe(1.1);
  });

  it("keeps a drawn zoom the camera's is all but on", () => {
    const near = 1 + ZOOM_SAME_SHARE / 2;
    expect(layerZoom(1, near, near)).toBe(1);
  });

  const input = (reducedMotion: boolean): CameraInput => ({
    self: { x: 0, y: 0 },
    viewport: { width: 1280, height: 720 },
    scaleTo: { width: 1280, height: 720 },
    reducedMotion,
  });
  /** Frame by frame from `from` to `to`: how often the map is drawn again, and the zoom it ends at. */
  const sweep = (from: number, to: number, reducedMotion = false) => {
    const camera = input(reducedMotion);
    let rig = { ...createCameraRig(), step: from, height: VIEW_STEPS[from]?.height ?? 0 };
    rig = { ...rig, step: to };
    let drawn = zoomFor(from, camera.viewport);
    let previous: number | undefined = drawn;
    let redraws = 0;
    for (let frame = 0; frame < 10 * 60; frame += 1) {
      const { rig: next, view } = stepCamera(rig, camera, 1 / 60);
      rig = next;
      const zoom = layerZoom(drawn, view.zoom, previous);
      previous = view.zoom;
      if (zoom !== drawn) {
        redraws += 1;
        drawn = zoom;
      }
    }
    return { redraws, drawn, settled: zoomFor(to, camera.viewport) };
  };
  const last = VIEW_STEPS.length - 1;
  const most = (from: number, to: number) =>
    Math.ceil(
      Math.abs(Math.log((VIEW_STEPS[to]?.height ?? 1) / (VIEW_STEPS[from]?.height ?? 1))) /
        Math.log(ZOOM_REDRAW_RATIO),
    ) + 1;

  it.each([
    [0, last],
    [last, 0],
  ])("is drawn again a few times, not every frame, from step %i to %i", (from, to) => {
    const { redraws, drawn, settled } = sweep(from, to);
    expect(redraws).toBeGreaterThan(0);
    expect(redraws).toBeLessThanOrEqual(most(from, to));
    expect(Math.abs(drawn - settled)).toBeLessThanOrEqual(ZOOM_SAME_SHARE * settled);
  });

  it("is drawn again once for a zoom with reduced motion", () => {
    const { redraws, drawn, settled } = sweep(0, 1, true);
    expect(redraws).toBe(1);
    expect(drawn).toBe(settled);
  });
});
