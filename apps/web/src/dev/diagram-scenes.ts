import type { CreatureLook, ProfessionId } from "@vibewars/game-core";

/** A body in a diagram: idle, where it says, on the layer it says. */
export interface SceneActor {
  readonly profession: ProfessionId;
  readonly team: number;
  readonly x: number;
  readonly y: number;
  /** Its layer; omitted, the map's ground. */
  readonly layer?: number;
}

/** A creature in a scene (#4171): its look, standing on the map's ground. */
export interface SceneCreature {
  readonly look: CreatureLook;
  readonly team: number;
  readonly x: number;
  readonly y: number;
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
  readonly creatures: readonly SceneCreature[];
  readonly markers: readonly SceneRing[];
}

/** A diagram of a screen, taken through the e2e helpers. */
export interface UiScene {
  readonly id: string;
  readonly ui: "team-arena-size" | "team-arena-signup";
}

/**
 * The first set (#3557). Cameras and compositions are the asset
 * designer's to adjust; re-run `pnpm docs:diagrams` after a change.
 */
export const DIAGRAM_SCENES: readonly DiagramScene[] = [
  {
    id: "layers-deck",
    map: "canthan-terraces",
    camera: { x: 520, y: 1290, zoom: 1.1 },
    actors: [
      { profession: "warrior", team: 0, x: 520, y: 1200, layer: 2 },
      { profession: "monk", team: 1, x: 520, y: 1450, layer: 1 },
    ],
    creatures: [],
    markers: [],
  },
  {
    id: "layers-tunnel",
    map: "canthan-terraces",
    camera: { x: 700, y: 1380, zoom: 1.2 },
    actors: [{ profession: "ranger", team: 0, x: 700, y: 1330, layer: 0 }],
    creatures: [],
    markers: [],
  },
  {
    id: "alt-click",
    map: "canthan-terraces",
    camera: { x: 520, y: 1290, zoom: 1.1 },
    actors: [{ profession: "warrior", team: 0, x: 520, y: 1450, layer: 1 }],
    creatures: [],
    markers: [
      { x: 520, y: 1200, dashed: false },
      { x: 520, y: 1320, dashed: true },
    ],
  },
  {
    id: "world-lever-gate",
    map: "arena-crossroads",
    camera: { x: 2200, y: 470, zoom: 1.3 },
    actors: [{ profession: "elementalist", team: 0, x: 2260, y: 530, layer: 1 }],
    creatures: [],
    markers: [],
  },
  {
    id: "world-wall-mire",
    map: "canthan-terraces",
    camera: { x: 1110, y: 1740, zoom: 1 },
    actors: [{ profession: "warrior", team: 0, x: 1120, y: 1780, layer: 1 }],
    creatures: [],
    markers: [],
  },
];

/**
 * Scenes the render bench measures (#4171), drawn on and on rather than
 * held after one frame: a crowd of 16 bodies, 8 spirits and 16 minions.
 */
export const BENCH_SCENES: readonly DiagramScene[] = [
  {
    id: "creature-crowd",
    map: "ember-pits",
    camera: { x: 1600, y: 1100, zoom: 1.4 },
    actors: Array.from({ length: 16 }, (_, i) => ({
      profession: (["warrior", "monk", "ranger", "necromancer"] as const)[i % 4] ?? "warrior",
      team: i < 8 ? 0 : 1,
      x: 1420 + (i % 8) * 50,
      y: i < 8 ? 960 : 1240,
    })),
    creatures: Array.from({ length: 24 }, (_, i) => ({
      look: i < 8 ? "spirit" : "bone-minion",
      team: i % 2,
      x: 1400 + (i % 12) * 36,
      y: i < 12 ? 1060 : 1140,
    })),
    markers: [],
  },
  {
    // The PR's still: a spirit cluster and two ghostly heroes at match zoom.
    id: "creature-figures",
    map: "ember-pits",
    camera: { x: 1600, y: 1100, zoom: 2.4 },
    actors: [{ profession: "ritualist", team: 0, x: 1520, y: 1080 }],
    creatures: [
      { look: "spirit", team: 0, x: 1560, y: 1050 },
      { look: "spirit", team: 0, x: 1590, y: 1090 },
      { look: "spirit", team: 1, x: 1550, y: 1130 },
      { look: "ghostly-hero", team: 0, x: 1660, y: 1060 },
      { look: "ghostly-hero", team: 1, x: 1690, y: 1130 },
    ],
    markers: [],
  },
  {
    // The PR's still (#4172): every minion look side by side at match zoom.
    id: "minion-figures",
    map: "ember-pits",
    camera: { x: 1600, y: 1100, zoom: 2.4 },
    actors: [{ profession: "necromancer", team: 0, x: 1460, y: 1100 }],
    creatures: (
      [
        "bone-minion",
        "bone-horror",
        "bone-fiend",
        "vampiric-horror",
        "shambling-horror",
        "jagged-horror",
        "flesh-golem",
      ] as const
    ).map((look, i) => ({ look, team: 0, x: 1480 + i * 44, y: 1100 })),
    markers: [],
  },
];

export const UI_SCENES: readonly UiScene[] = [
  { id: "team-arena-1", ui: "team-arena-size" },
  { id: "team-arena-2", ui: "team-arena-signup" },
];
