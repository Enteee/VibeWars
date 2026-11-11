import type { DeckLook, TransitionLook } from "@vibewars/game-maps/schema";

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
/** The scene's background, past the arena: the ground of a flat map, which has no floor fill. */
export const ARENA_BACKGROUND = 0x0e1116;

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

/**
 * A switch's lever (#3025, #3053, docs/art/3053-hazards.md): a stone base
 * and a wooden arm, which reads by its angle, standing or lying; its knob
 * is brass while up, with a small brass glow, and dull grey once thrown.
 */
export const SWITCH_MARK_LOOK = {
  base: 0x827b70,
  baseFace: shade(0x827b70, 0.4),
  outline: 0x23211d,
  arm: 0x8a5a2a,
  armEdge: 0x3a2412,
  knobUp: 0xe8c27a,
  knobDown: 0x6a6560,
  shadow: 0x0b0a08,
};

/**
 * A portal (#3030, docs/art/3030-world-elements.md): ten rune stones round
 * a swirl dish. On, the dish swirls aqua round a white core, the runes
 * glow and a wisp rises; off, the dish is dark under a dashed grey ring
 * and the runes are dead. Aqua is help-class, never a harmful hue.
 */
export const TELEPORT_MARK_LOOK = {
  stone: 0x827b70,
  stoneFace: 0x6f695f,
  stoneTop: 0xc4bdb0,
  outline: 0x23211d,
  dish: 0x12161d,
  swirl: 0x5fe0d0,
  core: 0xffffff,
  offRing: 0x6a6f78,
  shadow: 0x0b0a08,
};

/**
 * A gate's door (#3061, #3053, docs/art/3053-hazards.md): oak leaves in an
 * iron frame, with iron bands and a brass knob; open, the leaves stand
 * swung back against the walls over a dark sill. Its pressure plate is
 * stone, sinking when held, its ring brass.
 */
export const GATE_DOOR_LOOK = {
  body: 0x7a4e26,
  face: shade(0x7a4e26, 0.4),
  lit: 0xa8743e,
  edge: 0x3b4759,
  band: 0x2a2a30,
  knob: 0xe8c27a,
  sill: 0x14161a,
  plate: 0x8f887b,
  plateFace: 0x4d4943,
  plateOutline: 0x23211d,
  plateHeld: 0x6f695f,
};

/** A switched deck (#3068) gone down or giving way: its cracks, its holes, the chains and frayed rope. */
export const SWITCHED_DECK_LOOK = {
  crack: 0x1c2330,
  hole: 0x0b0e14,
  chain: 0x8a8f99,
  fray: 0xd9a54a,
};

/** A portcullis (#3068): an iron grid in a stone arch, and the dark it closes. */
export const GATE_PORTCULLIS_LOOK = {
  iron: 0x7a8aa4,
  ironShade: 0x4a5568,
  dark: 0x0b0e14,
};

/**
 * A breakable wall (#3031, docs/art/3030-world-elements.md): chiselled
 * stone, warmer than a map wall's blue-grey, so it reads as one that can
 * break; dark cracks as it is struck, and rubble and dust once it falls.
 */
export const BREAKABLE_WALL_LOOK = {
  top: 0xa69f92,
  face: 0x6f695f,
  lit: 0xc4bdb0,
  mortar: 0x4d4943,
  edge: 0x23211d,
  crack: 0x17150f,
  rubble: 0x8f887b,
  rubbleFace: 0x5e5850,
  dust: 0x9a948a,
  shadow: 0x0b0a08,
};

/**
 * An energy barrier (#3031, docs/art/3030-world-elements.md): two slate
 * posts with aqua lamps and, closed, a shimmering aqua curtain between
 * them with bright edges; open, the posts and a faint dashed ghost.
 */
export const BARRIER_LOOK = {
  post: 0x4b5a70,
  postTop: 0x6a7c96,
  postEdge: 0x1c222b,
  lamp: 0x5fe0d0,
  curtain: 0x5fe0d0,
  edge: 0xc8fff6,
  ghost: 0x5fe0d0,
};

/** What a deck of one look is built of (#3067): its top, the lines on it, its face, its edge. */
export interface DeckLookColours {
  readonly top: number;
  readonly detail: number;
  readonly side: number;
  /** A parapet's or a railing's top, or a terrace's grass lip. */
  readonly edgeTop: number;
  /** A parapet's face, or a railing's posts. */
  readonly edgeFace: number;
  /** Piers and posts down to the layer below. */
  readonly support: number;
}

/** Each deck look's materials (#3067): stone and steel, earth and moss, wood. */
export const DECK_LOOK: Record<DeckLook, DeckLookColours> = {
  platform: {
    top: GRAPHIC_LAYERS.deckTop,
    detail: GRAPHIC_LAYERS.plank,
    side: GRAPHIC_LAYERS.slab,
    edgeTop: GRAPHIC_LAYERS.wallLit,
    edgeFace: GRAPHIC_LAYERS.wallFace,
    support: GRAPHIC_LAYERS.support,
  },
  tower: {
    top: 0x9aa6b4,
    detail: shade(0x9aa6b4, 0.22),
    side: 0x5c6a7c,
    edgeTop: 0xb8c5d4,
    edgeFace: shade(0x5c6a7c, 0.25),
    support: shade(0x5c6a7c, 0.35),
  },
  "wall-walk": {
    top: 0x8e9cae,
    detail: shade(0x8e9cae, 0.2),
    side: shade(0x4b5a70, 0.4),
    edgeTop: 0xa9bbd0,
    edgeFace: 0x4b5a70,
    support: shade(0x4b5a70, 0.4),
  },
  terrace: {
    top: 0x6b6448,
    detail: 0x4f5e3c,
    side: 0x5a4630,
    edgeTop: 0x6f8350,
    edgeFace: shade(0x5a4630, 0.3),
    support: shade(0x5a4630, 0.3),
  },
  "bridge-stone": {
    top: 0xaeb2b4,
    detail: shade(0xaeb2b4, 0.2),
    side: 0x6f695f,
    edgeTop: 0xc4bdb0,
    edgeFace: 0x827b70,
    support: shade(0x6f695f, 0.2),
  },
  "bridge-plank": {
    top: 0x8a6a46,
    detail: shade(0x8a6a46, 0.35),
    side: shade(0x8a6a46, 0.5),
    edgeTop: 0xc2ab7e,
    edgeFace: 0x3a2a1a,
    support: 0x3a2a1a,
  },
  "bridge-log": {
    top: 0x7a5e40,
    detail: shade(0x7a5e40, 0.3),
    side: shade(0x7a5e40, 0.5),
    edgeTop: 0x9d8160,
    edgeFace: shade(0x7a5e40, 0.6),
    support: shade(0x7a5e40, 0.6),
  },
};

/** What a transition of one look is built of (#3067): its slope, its treads and risers. */
export interface TransitionLookColours {
  readonly top: number;
  /** A ramp's panels, a stair's lit nosing, a ladder's rungs. */
  readonly step: number;
  /** A ramp's chevrons, a stair's riser, a ladder's rails. */
  readonly riser: number;
  readonly side: number;
}

/** Each transition look's materials (#3067). */
export const TRANSITION_LOOK: Record<TransitionLook, TransitionLookColours> = {
  ramp: {
    top: GRAPHIC_LAYERS.rampTop,
    step: GRAPHIC_LAYERS.rampPanel,
    riser: GRAPHIC_LAYERS.rampChevron,
    side: GRAPHIC_LAYERS.slab,
  },
  stairs: { top: 0xa2aebd, step: 0xccd6e2, riser: 0x56637a, side: GRAPHIC_LAYERS.slab },
  "stairs-landing": { top: 0xa8b4c3, step: 0xccd6e2, riser: 0x56637a, side: GRAPHIC_LAYERS.slab },
  ladder: { top: 0x2c3442, step: 0xa07a4c, riser: 0x6a4a2a, side: shade(0x2c3442, 0.3) },
  "rough-steps": { top: 0x6f6a58, step: 0x8f8a72, riser: 0x433e30, side: 0x4a4436 },
  /** Plank platform, brass chains and chevrons, an iron frame (#3079, docs/art/3079-lift.md). */
  lift: { top: 0xa07a48, step: 0xd4a843, riser: 0x7a8aa4, side: 0x4a3320 },
};
