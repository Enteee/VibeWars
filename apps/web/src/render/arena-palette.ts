/** Shaded toward black by `share`, 0 to 1. */
export function shade(colour: number, share: number): number {
  const channel = (at: number): number => Math.round(((colour >> at) & 0xff) * (1 - share)) << at;
  return channel(16) | channel(8) | channel(0);
}

/** The arena's static colours. */
export interface ArenaPalette {
  /** The ground's fill; `undefined` leaves the scene's background showing. */
  readonly floor: number | undefined;
  readonly grid: number;
  readonly wallTop: number;
  readonly wallFace: number;
  readonly wallLit: number;
  readonly wallStroke: number;
  readonly support: number;
  readonly deckTop: number;
  readonly plank: number;
  readonly slab: number;
  readonly rampTop: number;
  readonly rampPanel: number;
  readonly rampChevron: number;
}

export const WALL_STROKE = 0x3b4759;

const FLAT: ArenaPalette = {
  floor: undefined,
  grid: 0x1a212c,
  wallTop: 0x202836,
  wallFace: 0x202836,
  wallLit: WALL_STROKE,
  wallStroke: WALL_STROKE,
  support: 0x202836,
  deckTop: 0x2c3648,
  plank: 0x2c3648,
  slab: 0x151b26,
  rampTop: 0x262f3f,
  rampPanel: 0x262f3f,
  rampChevron: 0x4a5a72,
};

/** Direction D: docs/art/art-direction.md, "2.5D: Graphic layers". */
const GRAPHIC_LAYERS: ArenaPalette = {
  floor: 0x26303f,
  grid: 0x34415a,
  wallTop: 0x4b5a70,
  wallFace: shade(0x4b5a70, 0.4),
  wallLit: 0xa9bbd0,
  wallStroke: WALL_STROKE,
  support: shade(0x62748c, 0.3),
  deckTop: 0xa0b2c7,
  plank: shade(0xa0b2c7, 0.15),
  slab: shade(0x8fa4bd, 0.4),
  rampTop: 0xa9bbd0,
  rampPanel: shade(0xa9bbd0, 0.15),
  rampChevron: 0x4b5a70,
};

/** The colours of a map of `layerCount` layers. */
export function arenaPalette(layerCount: number): ArenaPalette {
  return layerCount > 1 ? GRAPHIC_LAYERS : FLAT;
}

export const DECK_SHADOW = { colour: 0x080b10, alpha: 0.55, offset: 32 };
export const DECK_TINT = { colour: 0x0d131c, alpha: 0.55 };
export const DECK_LIP = 0xffffff;

/** A pit (#2973): its floor a step darker than the ground, its far wall darker still. */
export const PIT_FLOOR = shade(0x26303f, 0.45);
export const PIT_WALL = shade(0x4b5a70, 0.6);
/** Where a tunnel leaves a pit: near black, so it reads as a way in. */
export const TUNNEL_MOUTH = 0x05070a;
/** A tunnel's outline, inlaid faintly in the ground over it. */
export const TUNNEL_INLAY = { colour: 0x8fa4bd, alpha: 0.3 };

/** How a depth of water looks (#2984): line widths are CSS px. */
export interface WaterLook {
  readonly fill: number;
  readonly fillAlpha: number;
  readonly shore: number;
  readonly shoreWidth: number;
  readonly ripple: number;
  readonly rippleAlpha: number;
}

/**
 * Deep water is dark, opaque and hard-shored: it cannot be walked. Shallow
 * is pale and see-through, its shore soft, the floor showing. They differ
 * by value and shore, not by hue alone (docs/art/art-direction.md).
 */
export const WATER_LOOK: Record<"deep" | "shallow", WaterLook> = {
  deep: {
    fill: 0x0a1320,
    fillAlpha: 1,
    shore: 0xc4dcee,
    shoreWidth: 3,
    ripple: 0x4e6c8a,
    rippleAlpha: 0.7,
  },
  shallow: {
    fill: 0x8fb8d6,
    fillAlpha: 0.3,
    shore: 0x8fb8d6,
    shoreWidth: 1,
    ripple: 0xe2f1fc,
    rippleAlpha: 0.5,
  },
};

/**
 * A torch's or fire's mark (#2989): a dark stand under a bright flame, so
 * the flame reads by value against the floor and the light pool around it.
 */
export const LIGHT_MARK_LOOK = {
  stand: 0x2a2018,
  stone: 0x5a5650,
  flame: 0xffb347,
  core: 0xfff1c4,
};
