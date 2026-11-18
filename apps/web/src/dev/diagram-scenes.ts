import type { ProfessionId } from "@vibewars/game-core";

/** A body in a diagram: idle, where it says, on the layer it says. */
export interface SceneActor {
  readonly profession: ProfessionId;
  readonly team: number;
  readonly x: number;
  readonly y: number;
  /** Its layer; omitted, the map's ground. */
  readonly layer?: number;
}

/** A hover ring at a point: dashed on the ground, solid off it. */
export interface SceneRing {
  readonly x: number;
  readonly y: number;
  readonly dashed: boolean;
}

/** A diagram drawn by the game's own renderer (#3557); its id names the PNG. */
export interface DiagramScene {
  readonly id: string;
  readonly map: string;
  readonly camera: { readonly x: number; readonly y: number; readonly zoom: number };
  readonly actors: readonly SceneActor[];
  readonly markers: readonly SceneRing[];
}

/** A diagram of a screen, taken through the e2e helpers. */
export interface UiScene {
  readonly id: string;
  readonly ui: "team-arena-size" | "team-arena-signup" | "team-arena-queue";
}

/**
 * The first set (#3557). Cameras and compositions are the asset
 * designer's to adjust; re-run `pnpm docs:diagrams` after a change.
 */
export const DIAGRAM_SCENES: readonly DiagramScene[] = [
  {
    id: "layers-deck",
    map: "canthan-terraces",
    camera: { x: 520, y: 1330, zoom: 1.1 },
    actors: [
      { profession: "warrior", team: 0, x: 520, y: 1200, layer: 2 },
      { profession: "monk", team: 1, x: 520, y: 1450, layer: 1 },
    ],
    markers: [],
  },
  {
    id: "layers-tunnel",
    map: "canthan-terraces",
    camera: { x: 1000, y: 1135, zoom: 0.9 },
    actors: [{ profession: "ranger", team: 0, x: 1000, y: 1135, layer: 0 }],
    markers: [],
  },
  {
    id: "alt-click",
    map: "canthan-terraces",
    camera: { x: 520, y: 1330, zoom: 1.1 },
    actors: [{ profession: "warrior", team: 0, x: 520, y: 1450, layer: 1 }],
    markers: [
      { x: 520, y: 1200, dashed: false },
      { x: 520, y: 1320, dashed: true },
    ],
  },
  {
    id: "world-elements",
    map: "canthan-terraces",
    camera: { x: 900, y: 1400, zoom: 0.5 },
    actors: [{ profession: "elementalist", team: 0, x: 1280, y: 1010, layer: 1 }],
    markers: [],
  },
];

export const UI_SCENES: readonly UiScene[] = [
  { id: "team-arena-1", ui: "team-arena-size" },
  { id: "team-arena-2", ui: "team-arena-signup" },
  { id: "team-arena-3", ui: "team-arena-queue" },
];
