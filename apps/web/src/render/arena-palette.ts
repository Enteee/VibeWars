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
