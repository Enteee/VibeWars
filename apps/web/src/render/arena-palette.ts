import type {
  AscentAct,
  Biome,
  DeckLook,
  OverhangLook,
  PavingLook,
  TransitionLook,
} from "@vibewars/game-maps/schema";

/** Shaded toward black by `share`, 0 to 1. */
export function shade(colour: number, share: number): number {
  const channel = (at: number): number => Math.round(((colour >> at) & 0xff) * (1 - share)) << at;
  return channel(16) | channel(8) | channel(0);
}

/** The arena's static colours. */
export interface ArenaPalette {
  /** The ground's fill; `undefined` leaves the scene's background showing. */
  readonly floor: number | undefined;
  /** The tile grid over the ground; `undefined` where the ground is not laid in tiles, as river ice is not. */
  readonly grid: number | undefined;
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

/** The colours of a map: a map of one layer is drawn flat whatever its biome. */
export function arenaPalette(map: MapLook & { readonly layerCount: number }): ArenaPalette {
  return map.layerCount > 1 ? materialsOf(map).palette : FLAT;
}

export const DECK_SHADOW = { colour: 0x080b10, alpha: 0.55, offset: 32 };
/**
 * The shade under an awning, lean-to or canopy (#3293): softer than a
 * deck's, laid twice, the second nearer, so its edge blurs.
 */
export const OVERHANG_SHADE = { colour: 0x080b10, alpha: 0.2, offsets: [6, 14] } as const;
export const DECK_TINT = { colour: 0x0d131c, alpha: 0.55 };
export const DECK_LIP = 0xffffff;

/**
 * A pit (#2973): its floor, and a tunnel's (#3329), 45 % darker than the
 * ground, in the biome's tone, so the light in it warms a floor and not a
 * void.
 */
export function pitFloor(palette: ArenaPalette): number {
  return shade(palette.floor ?? ARENA_BACKGROUND, 0.45);
}
/** Its far wall: the biome's rock, darker still. */
export function pitWall(palette: ArenaPalette): number {
  return shade(palette.wallTop, 0.6);
}
/** Where a tunnel leaves a pit: near black, so it reads as a way in. */
export const TUNNEL_MOUTH = 0x05070a;

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
  /** A brazier's iron (#3504): its side, its rim where its own fire lights it, and its 2 px outline. */
  iron: 0x3a3430,
  ironRim: 0x7a6250,
  outline: 0x120e0c,
  /** A brazier's coals and flame: fire colours (docs/art/visual-style.md §2). */
  coals: 0xff9040,
  blaze: 0xffd23d,
  /** The contact shadow under a brazier, and how dark. */
  shadow: 0x000000,
  shadowAlpha: 0.35,
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

/** How a breakable wall's face is laid (#3370): dressed blocks, small bricks, a sheet of ice, or field stones. */
export type BreakableCourses = "blocks" | "bricks" | "ice" | "fieldstone";

/** A breakable wall's material (#3370): its stone, its cracks, and what it falls to. */
export interface BreakableLook {
  readonly courses: BreakableCourses;
  readonly top: number;
  readonly face: number;
  readonly lit: number;
  /** The joints between its blocks, or the strata in its ice. */
  readonly mortar: number;
  readonly edge: number;
  readonly crack: number;
  /** What glows in its cracks once it is badly hurt; `undefined` where nothing does. */
  readonly glow: number | undefined;
  /** Moss on its top and upper face; `undefined` where none grows. */
  readonly moss: number | undefined;
  readonly rubble: number;
  readonly rubbleFace: number;
  readonly dust: number;
  readonly shadow: number;
}

/**
 * A breakable wall of chiselled stone (#3031, docs/art/3030-world-elements.md),
 * warmer than a map wall's blue-grey, so it reads as one that can break:
 * the hall's and the heights' look, and every map of one layer's.
 */
export const BREAKABLE_WALL_LOOK: BreakableLook = {
  courses: "blocks",
  top: 0xa69f92,
  face: 0x6f695f,
  lit: 0xc4bdb0,
  mortar: 0x4d4943,
  edge: 0x23211d,
  crack: 0x17150f,
  glow: undefined,
  moss: undefined,
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

/** Each deck look's materials in the hall (#3067): stone and steel, earth and moss, wood. */
const DECK_LOOK: Record<DeckLook, DeckLookColours> = {
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
  ledge: {
    top: 0x6b7a90,
    detail: shade(0x6b7a90, 0.2),
    side: 0x3a4658,
    edgeTop: 0x8e9db2,
    edgeFace: shade(0x3a4658, 0.3),
    support: shade(0x3a4658, 0.3),
  },
  /** Snow lying deep on a bank or a ridge (#3286): pale, rock in its face and showing through. */
  drift: {
    top: 0xb4c4d6,
    detail: shade(0xb4c4d6, 0.14),
    side: 0x5c6a7c,
    edgeTop: 0xd8e2ee,
    edgeFace: shade(0x5c6a7c, 0.3),
    support: shade(0x5c6a7c, 0.4),
  },
  /** Masonry fallen in: the same stone as a stone bridge, weathered darker. */
  ruin: {
    top: 0x9a9588,
    detail: shade(0x9a9588, 0.25),
    side: 0x5f5a50,
    edgeTop: 0xb4ae9f,
    edgeFace: shade(0x5f5a50, 0.3),
    support: shade(0x5f5a50, 0.4),
  },
  /** Rock, its opening `support`: the dark under it. */
  arch: {
    top: 0x7e8796,
    detail: shade(0x7e8796, 0.2),
    side: 0x4a5262,
    edgeTop: 0x9aa5b6,
    edgeFace: shade(0x4a5262, 0.3),
    support: 0x161a21,
  },
  /** Masonry with merlons; its passage `support`, its grid `edgeTop` iron. */
  "gatehouse-roof": {
    top: 0xa6b4c6,
    detail: shade(0xa6b4c6, 0.2),
    side: 0x5a6676,
    edgeTop: 0x8c96a4,
    edgeFace: shade(0x5a6676, 0.25),
    support: 0x161a21,
  },
  /** Plaster: warm and desaturated, not danger orange; its door `support`. */
  rooftop: {
    top: 0xb5a98f,
    detail: shade(0xb5a98f, 0.2),
    side: 0x6a604f,
    edgeTop: 0xcfc4aa,
    edgeFace: shade(0x6a604f, 0.3),
    support: 0x2a2219,
  },
  pier: {
    top: 0x8f7150,
    detail: shade(0x8f7150, 0.35),
    side: shade(0x8f7150, 0.45),
    edgeTop: 0xb39572,
    edgeFace: 0x3a2a1a,
    support: 0x3a2a1a,
  },
  /** Two tiers of stone; its capture ring `edgeTop`, the same brass as a lever's. */
  plinth: {
    top: 0xa9adb4,
    detail: shade(0xa9adb4, 0.22),
    side: 0x5d6470,
    edgeTop: 0xe8c27a,
    edgeFace: shade(0x5d6470, 0.25),
    support: 0x7d8592,
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

/** Each transition look's materials in the hall (#3067). */
const TRANSITION_LOOK: Record<TransitionLook, TransitionLookColours> = {
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

/** A biome's base tones (#3172, docs/art/visual-style.md §1). */
export interface BiomeTones {
  readonly ground: number;
  /** Walls, cliffs, ledges: rock as it stands. */
  readonly rock: number;
  /** Decks, stairs and masonry: dressed stone, and the light on its edges. */
  readonly stone: number;
  readonly wood: number;
  readonly earth: number;
  /** Moss and grass. */
  readonly plant: number;
}

/** What one colour of the hall's is made of: `kept` is the same in every biome, as brass and iron are. */
type Material = keyof BiomeTones | "kept";

/** The hall's tones, which every other biome's colours are tinted from. */
const HALL_TONES: BiomeTones = {
  ground: GRAPHIC_LAYERS.floor ?? ARENA_BACKGROUND,
  rock: GRAPHIC_LAYERS.wallTop,
  stone: GRAPHIC_LAYERS.deckTop,
  wood: 0x8a6a46,
  earth: 0x5a4630,
  plant: 0x4f5e3c,
};

/** Each biome's tones; the heights are the hall's until their maps are rebuilt (#3064). */
const BIOME_TONES: Record<Biome, BiomeTones> = {
  hall: HALL_TONES,
  heights: HALL_TONES,
  /** Moss on dark earth (#3071): the hall's dressed stone and wood, built in a wood. */
  wilds: {
    ...HALL_TONES,
    ground: 0x2a3328,
    rock: 0x5b5f58,
  },
  /** Warm sandstone, desaturated so danger orange and yellow stay the loudest warm things. */
  desert: {
    ground: 0x3b3226,
    rock: 0x6e6252,
    stone: 0xc2b296,
    wood: 0x8a6a46,
    earth: 0x6e5a40,
    /** Dry scrub: green would be nature's. */
    plant: 0x6a6448,
  },
  /**
   * A cooling crust of basalt and ash (#3225): near-black, a breath warm,
   * so the lava on it is by far the hottest thing on the ground.
   */
  volcanic: {
    ground: 0x2b2421,
    rock: 0x4a4340,
    stone: 0x8c827a,
    /** Charred. */
    wood: 0x5e4632,
    earth: 0x4a3426,
    /** Ash-choked scrub. */
    plant: 0x5a5444,
  },
  /**
   * A frozen river (#3286, docs/art/3072-frozen-crossing.md): neutral greys,
   * the river ice a breath cooler, kept mid-grey so the friend blue holds on it.
   */
  snow: {
    /** River ice: the floor that shows, the banks being decks. */
    ground: 0x7d8a8e,
    rock: 0x4d4a4a,
    stone: 0x9ea4ab,
    wood: 0x7a6248,
    /** Thaw slush. */
    earth: 0x6a6050,
    plant: 0x6a6a58,
  },
  /**
   * A dark river ford (#3434, docs/art/3074-blackwater-ford.md): the wilds'
   * dark ground a little cooler, dry olive reed and silt, all low chroma.
   */
  marsh: {
    ...HALL_TONES,
    ground: 0x2a3430,
    rock: 0x54594f,
    /** Silt. */
    earth: 0x4a4034,
    /** Dry reed: green would be nature's. */
    plant: 0x5c5a3a,
  },
  /**
   * Overgrown temple ruins (#3436, docs/art/3074-jungle-ruins.md): a dark wet
   * floor with mossy grey stone, olive vine and clay, all low chroma, so the
   * nature green and the friend blue stay the loudest things.
   */
  jungle: {
    ...HALL_TONES,
    ground: 0x232c26,
    /** Mossy stone. */
    rock: 0x5a5c52,
    /** Clay. */
    earth: 0x5a4a30,
    /** Vine: olive, never nature's green. */
    plant: 0x545a38,
  },
  /**
   * An island guild hall (#3445, docs/art/3077-guild-hall-isle.md): wet sand
   * and grey sea rock with dry olive plants, beside a deep teal sea; no tone
   * near the friend blue, the foe red or the nature green.
   */
  coast: {
    ...HALL_TONES,
    /** Wet sand. */
    ground: 0x7d7358,
    /** Grey sea rock. */
    rock: 0x5b6770,
    /** Weathered pale stone. */
    stone: 0xa49c88,
    /** Driftwood. */
    wood: 0x7a6a56,
    /** Dark tide sand. */
    earth: 0x5e5644,
    /** Dry olive: green would be nature's. */
    plant: 0x6d6a3e,
  },
  /**
   * A cavern under a thin ceiling (#3444, docs/art/3077-hollow-deep.md): cold
   * slate, its only colour the violet glow of its pools, which is light, not
   * a tone. Every tone is low chroma, well away from the friend blue, the foe
   * red, the nature green and the magic violet.
   */
  cavern: {
    ground: 0x232a33,
    rock: 0x4a5260,
    /** Dressed slate: the shelves, the dais and the stairs. */
    stone: 0x8a909c,
    /** Old rope-bridge timber, grey with damp. */
    wood: 0x6a6052,
    /** Cave silt. */
    earth: 0x403428,
    /** Lichen: a dull violet grey, the glow's ghost. */
    plant: 0x4f4a5c,
  },
};

/**
 * Each act's ground and wall rock (#3618, §1b), laid over the biome's own
 * tones: the rest of a map's materials are tinted from them as from a biome's.
 */
export const ACT_TONES: Record<AscentAct, Pick<BiomeTones, "ground" | "rock">> = {
  /** Basalt crust. */
  volcanic: { ground: 0x2b2320, rock: 0x4a4340 },
  /** Slate. */
  underworld: { ground: 0x1f2428, rock: 0x38424a },
  /** Pale stone: the one pale floor. */
  heavenly: { ground: 0xe8dfc8, rock: 0xb9ad92 },
};

/** What each colour of the arena is made of. */
const PALETTE_MATERIAL: Record<keyof ArenaPalette, Material> = {
  floor: "ground",
  grid: "ground",
  wallTop: "rock",
  wallFace: "rock",
  wallLit: "rock",
  wallStroke: "rock",
  support: "rock",
  deckTop: "stone",
  plank: "stone",
  slab: "stone",
  rampTop: "stone",
  rampPanel: "stone",
  rampChevron: "rock",
};

/** What a look is made of, and the colours of it that are something else. */
interface LookMaterial<Colours> {
  readonly of: Material;
  readonly but?: Partial<Record<keyof Colours, Material>>;
}

const DECK_MATERIAL: Record<DeckLook, LookMaterial<DeckLookColours>> = {
  platform: { of: "stone", but: { edgeFace: "rock", support: "rock" } },
  tower: { of: "stone" },
  "wall-walk": { of: "stone", but: { side: "rock", edgeFace: "rock", support: "rock" } },
  terrace: { of: "earth", but: { detail: "plant", edgeTop: "plant" } },
  "bridge-stone": { of: "stone" },
  "bridge-plank": { of: "wood" },
  "bridge-log": { of: "wood" },
  ledge: { of: "rock" },
  drift: { of: "stone", but: { side: "rock", edgeFace: "rock", support: "rock" } },
  ruin: { of: "stone" },
  arch: { of: "rock" },
  "gatehouse-roof": { of: "stone", but: { edgeTop: "kept" } },
  rooftop: { of: "earth" },
  pier: { of: "wood" },
  plinth: { of: "stone", but: { edgeTop: "kept" } },
};

const TRANSITION_MATERIAL: Record<TransitionLook, LookMaterial<TransitionLookColours>> = {
  ramp: { of: "stone", but: { riser: "rock" } },
  stairs: { of: "stone" },
  "stairs-landing": { of: "stone" },
  ladder: { of: "wood", but: { top: "rock", side: "rock" } },
  "rough-steps": { of: "earth" },
  lift: { of: "wood", but: { step: "kept", riser: "kept" } },
};

/** `colour`, of the hall's `material`, in `tones`: each channel scaled as the tone's is to the hall's. */
function tint(colour: number, material: Material, tones: BiomeTones): number {
  if (material === "kept") {
    return colour;
  }
  const to = tones[material];
  const from = HALL_TONES[material];
  const channel = (at: number): number =>
    Math.min(
      255,
      Math.round((((colour >> at) & 0xff) * ((to >> at) & 0xff)) / ((from >> at) & 0xff)),
    ) << at;
  return channel(16) | channel(8) | channel(0);
}

/** `colours`, each tinted as what `made` says it is made of. */
function tintAll<Colours extends { readonly [Slot in keyof Colours]: number | undefined }>(
  colours: Colours,
  made: (slot: keyof Colours) => Material,
  tones: BiomeTones,
): Colours {
  return Object.fromEntries(
    (Object.keys(colours) as (keyof Colours & string)[]).map((slot) => {
      const colour = colours[slot];
      return [slot, colour === undefined ? undefined : tint(colour, made(slot), tones)];
    }),
  ) as Colours;
}

/** A paving look laid in stones, slabs or pebbles (#3210); lava is a molten zone's ground (#3245). */
export type StonePavingLook = Exclude<PavingLook, "lava">;

/** What a paved surface of one look is made of (#3210): its bed, its stones, their lit edge, its rim. */
export interface PavingLookColours {
  /** Under and between the stones: mortar, packed sand, the dirt itself. */
  readonly bed: number;
  readonly stone: number;
  readonly light: number;
  /** The darker line round its edge and under each stone. */
  readonly rim: number;
}

/** `from` moved `share` of the way to `to`, channel by channel. */
function mix(from: number, to: number, share: number): number {
  const channel = (at: number): number =>
    Math.round(((from >> at) & 0xff) + (((to >> at) & 0xff) - ((from >> at) & 0xff)) * share) << at;
  return channel(16) | channel(8) | channel(0);
}

/**
 * Each paving look in `tones` (#3210): a floor material, so each colour
 * is the ground moved part of the way to what it is laid in, never
 * brighter than the stone of a deck.
 */
function pavingColours(tones: BiomeTones): Record<StonePavingLook, PavingLookColours> {
  const rim = shade(tones.ground, 0.45);
  return {
    cobbles: {
      bed: shade(tones.ground, 0.25),
      stone: mix(tones.ground, tones.stone, 0.32),
      light: mix(tones.ground, tones.stone, 0.5),
      rim,
    },
    flagstones: {
      bed: shade(tones.ground, 0.3),
      stone: mix(tones.ground, tones.rock, 0.6),
      light: mix(tones.ground, tones.stone, 0.4),
      rim,
    },
    dirt: {
      bed: mix(tones.ground, tones.earth, 0.55),
      stone: mix(tones.ground, tones.rock, 0.6),
      light: mix(tones.ground, tones.earth, 0.75),
      rim,
    },
  };
}
/** An overhang look's colours (#3293): its roof, the stripes or slats or leaves on it, and its eave. */
export interface OverhangLookColours {
  readonly roof: number;
  readonly detail: number;
  readonly eave: number;
}

/**
 * Each overhang look in `tones` (#3293): a cloth awning dyed from the
 * biome's earth and stone, a timber lean-to of its wood, a leafy canopy
 * of its plants.
 */
function overhangColours(tones: BiomeTones): Record<OverhangLook, OverhangLookColours> {
  return {
    awning: {
      roof: mix(tones.earth, tones.stone, 0.55),
      detail: shade(tones.earth, 0.15),
      eave: shade(tones.earth, 0.45),
    },
    "lean-to": {
      roof: tones.wood,
      detail: shade(tones.wood, 0.35),
      eave: shade(tones.wood, 0.55),
    },
    canopy: {
      roof: tones.plant,
      detail: mix(tones.plant, tones.stone, 0.25),
      eave: shade(tones.plant, 0.5),
    },
  };
}

/**
 * A biome's decor colours (#4013): its wood for crates and trunks, its
 * plants for crowns and ferns, its stone burnt to ash for a cinder drift
 * (#4018), each with the lit and the shaded face of a north-west light.
 * Iron and fire are the same everywhere.
 */
export interface DecorColours {
  readonly wood: number;
  readonly woodLit: number;
  readonly woodShade: number;
  readonly bark: number;
  readonly barkShade: number;
  readonly plant: number;
  readonly plantLit: number;
  readonly plantShade: number;
  readonly ash: number;
  readonly ashLit: number;
  readonly ashShade: number;
  readonly iron: number;
  readonly ironShade: number;
  readonly ember: number;
  readonly flame: number;
  readonly flameCore: number;
}

function decorColours(tones: BiomeTones): DecorColours {
  return {
    wood: tones.wood,
    woodLit: mix(tones.wood, tones.stone, 0.35),
    woodShade: shade(tones.wood, 0.42),
    bark: shade(tones.wood, 0.2),
    barkShade: shade(tones.wood, 0.5),
    plant: tones.plant,
    plantLit: mix(tones.plant, 0xf0f0a0, 0.25),
    plantShade: shade(tones.plant, 0.42),
    ash: mix(tones.ground, tones.stone, 0.4),
    ashLit: mix(tones.ground, tones.stone, 0.6),
    ashShade: mix(tones.ground, tones.stone, 0.15),
    iron: 0x4a4a52,
    ironShade: 0x26262c,
    ember: 0xe0662a,
    flame: 0xffa040,
    flameCore: 0xfff0a0,
  };
}

/** A map's materials (#3172): its arena's colours, and each deck, transition and paving look's. */
export interface BiomeMaterials {
  readonly palette: ArenaPalette;
  readonly deck: Record<DeckLook, DeckLookColours>;
  readonly transition: Record<TransitionLook, TransitionLookColours>;
  readonly paving: Record<StonePavingLook, PavingLookColours>;
  readonly overhang: Record<OverhangLook, OverhangLookColours>;
  readonly dressing: GroundDressingTones;
  readonly breakable: BreakableLook;
  readonly decor: DecorColours;
}

function lookColours<
  Look extends string,
  Colours extends { readonly [Slot in keyof Colours]: number | undefined },
>(
  looks: Record<Look, Colours>,
  materials: Record<Look, LookMaterial<Colours>>,
  tones: BiomeTones,
): Record<Look, Colours> {
  return Object.fromEntries(
    (Object.keys(looks) as Look[]).map((look) => {
      const { of, but } = materials[look];
      return [look, tintAll(looks[look], (slot) => but?.[slot] ?? of, tones)];
    }),
  ) as Record<Look, Colours>;
}

/**
 * Whether a biome's ground is laid in tiles, and drawn with the grid on it:
 * dressed stone and packed earth are; river ice is one sheet (#3286).
 */
const TILED_GROUND: Record<Biome, boolean> = {
  hall: true,
  heights: true,
  wilds: true,
  desert: true,
  volcanic: true,
  snow: false,
  marsh: true,
  jungle: true,
  coast: true,
  cavern: true,
};

/** A biome's ground grain and the marks scattered on it (#3484), from its own tones. */
export interface GroundDressingTones {
  /** The grain's two ends, either side of the ground's own tone. */
  readonly grain: readonly [dark: number, light: number];
  /** The biome's first mark: a crack, a pebble, a tuft, a cinder or a drift. */
  readonly mark: number;
  /** Its second: grit, stones, ripples or cracks. */
  readonly accent: number;
  /** Every mark's outline: the ground, much darker. */
  readonly outline: number;
}

function dressingTones(tones: BiomeTones, mark: number, accent: number): GroundDressingTones {
  return {
    grain: [shade(tones.ground, 0.22), mix(tones.ground, tones.stone, 0.14)],
    mark,
    accent,
    outline: shade(tones.ground, 0.55),
  };
}

/**
 * Each biome's two marks (#3484, visual-style §4), from its tones: both
 * near its ground, so none reads as a signal, a pickup or a zone.
 */
const GROUND_MARKS: Record<Biome, (tones: BiomeTones) => readonly [mark: number, accent: number]> =
  {
    // Cracked flags and grit.
    hall: (tones) => [shade(tones.ground, 0.4), mix(tones.ground, tones.rock, 0.5)],
    // Pebbles of the rock, and its chips.
    heights: (tones) => [mix(tones.ground, tones.rock, 0.55), shade(tones.rock, 0.25)],
    // Grass tufts and field stones.
    wilds: (tones) => [mix(tones.plant, tones.ground, 0.25), mix(tones.ground, tones.rock, 0.55)],
    // Pebbles, and ripple lines the wind leaves.
    desert: (tones) => [mix(tones.ground, tones.rock, 0.55), mix(tones.ground, tones.stone, 0.22)],
    // Cinders and cracks in the crust: cold, never an ember.
    volcanic: (tones) => [mix(tones.ground, tones.stone, 0.3), shade(tones.ground, 0.5)],
    // Drift ridges on the ice, and its frost.
    snow: (tones) => [mix(tones.ground, tones.stone, 0.6), shade(tones.ground, 0.12)],
    // Dry reed tufts and silt patches.
    marsh: (tones) => [mix(tones.plant, tones.ground, 0.3), mix(tones.ground, tones.earth, 0.6)],
    // Vine leaves and clay crumbs.
    jungle: (tones) => [mix(tones.plant, tones.ground, 0.3), mix(tones.ground, tones.earth, 0.6)],
    // Shells and pebbles of the sea rock, and tide ripples.
    coast: (tones) => [mix(tones.ground, tones.rock, 0.55), mix(tones.ground, tones.earth, 0.6)],
    // Fallen stone chips and silt grit.
    cavern: (tones) => [mix(tones.ground, tones.rock, 0.55), mix(tones.ground, tones.earth, 0.6)],
  };

function biomeMaterials(biome: Biome, tones: BiomeTones, tiled: boolean): BiomeMaterials {
  const palette = tintAll(GRAPHIC_LAYERS, (slot) => PALETTE_MATERIAL[slot], tones);
  return {
    palette: tiled ? palette : { ...palette, grid: undefined },
    deck: lookColours(DECK_LOOK, DECK_MATERIAL, tones),
    transition: lookColours(TRANSITION_LOOK, TRANSITION_MATERIAL, tones),
    paving: pavingColours(tones),
    overhang: overhangColours(tones),
    dressing: dressingTones(tones, ...GROUND_MARKS[biome](tones)),
    breakable: breakableLookOf(biome, tones),
    decor: decorColours(tones),
  };
}

/** Each biome's materials (#3172), tinted from the hall's by its tones. */
export const BIOME: Record<Biome, BiomeMaterials> = {
  hall: biomeMaterials("hall", BIOME_TONES.hall, TILED_GROUND.hall),
  heights: biomeMaterials("heights", BIOME_TONES.heights, TILED_GROUND.heights),
  wilds: biomeMaterials("wilds", BIOME_TONES.wilds, TILED_GROUND.wilds),
  desert: biomeMaterials("desert", BIOME_TONES.desert, TILED_GROUND.desert),
  volcanic: biomeMaterials("volcanic", BIOME_TONES.volcanic, TILED_GROUND.volcanic),
  snow: biomeMaterials("snow", BIOME_TONES.snow, TILED_GROUND.snow),
  marsh: biomeMaterials("marsh", BIOME_TONES.marsh, TILED_GROUND.marsh),
  jungle: biomeMaterials("jungle", BIOME_TONES.jungle, TILED_GROUND.jungle),
  coast: biomeMaterials("coast", BIOME_TONES.coast, TILED_GROUND.coast),
  cavern: biomeMaterials("cavern", BIOME_TONES.cavern, TILED_GROUND.cavern),
};

/** What a map is drawn in: its biome, and the Ascent act laid over it (#3618). */
export interface MapLook {
  readonly biome: Biome;
  readonly ascentAct: AscentAct | null;
}

/**
 * Whether an act's ground takes the tile grid. The grid is lighter than
 * its floor, and nothing is lighter than the heavenly marble: tinted that
 * pale, it clips to white, so that floor is laid as one sheet.
 */
const ACT_TILED: Record<AscentAct, boolean> = {
  volcanic: true,
  underworld: true,
  heavenly: false,
};

const ACT_MATERIALS = new Map<string, BiomeMaterials>();

/**
 * A map's materials (#3618): its biome's, or on the Heroes' Ascent its
 * biome's tones with its act's ground and rock laid over them, so each
 * act's floor and walls are the same whatever biome it stands on.
 */
export function materialsOf(map: MapLook): BiomeMaterials {
  const { biome, ascentAct } = map;
  if (ascentAct === null) {
    return BIOME[biome];
  }
  const key = `${biome}/${ascentAct}`;
  const known = ACT_MATERIALS.get(key);
  if (known !== undefined) {
    return known;
  }
  const materials = biomeMaterials(
    biome,
    { ...BIOME_TONES[biome], ...ACT_TONES[ascentAct] },
    TILED_GROUND[biome] && ACT_TILED[ascentAct],
  );
  ACT_MATERIALS.set(key, materials);
  return materials;
}

/**
 * Each biome's breakable wall (#3370): a weaker patch of its own walls,
 * tinted from its tones. Basalt with embers in its cracks, mud brick with
 * straw-pale mortar, blue-white ice that cracks white, mossy field stone;
 * the chiselled stone elsewhere, in its rock.
 */
function breakableLookOf(biome: Biome, tones: BiomeTones): BreakableLook {
  switch (biome) {
    case "volcanic":
      return {
        courses: "blocks",
        top: mix(tones.rock, tones.stone, 0.18),
        face: shade(tones.rock, 0.08),
        lit: mix(tones.rock, tones.stone, 0.55),
        mortar: shade(tones.rock, 0.62),
        edge: shade(tones.rock, 0.8),
        crack: 0x1c0d08,
        glow: 0xe0662a,
        moss: undefined,
        rubble: mix(tones.rock, tones.stone, 0.12),
        rubbleFace: shade(tones.rock, 0.4),
        dust: mix(tones.ground, tones.stone, 0.45),
        shadow: BREAKABLE_WALL_LOOK.shadow,
      };
    case "desert":
      return {
        courses: "bricks",
        top: mix(tones.earth, tones.stone, 0.62),
        face: mix(tones.earth, tones.stone, 0.3),
        lit: mix(tones.stone, 0xffffff, 0.18),
        mortar: mix(tones.stone, 0xeee0b4, 0.55),
        edge: shade(tones.earth, 0.65),
        crack: shade(tones.earth, 0.72),
        glow: undefined,
        moss: undefined,
        rubble: mix(tones.earth, tones.stone, 0.5),
        rubbleFace: mix(tones.earth, tones.ground, 0.3),
        dust: mix(tones.stone, tones.earth, 0.4),
        shadow: BREAKABLE_WALL_LOOK.shadow,
      };
    case "snow":
      return {
        courses: "ice",
        top: mix(tones.stone, 0xd6ecfa, 0.7),
        face: mix(tones.stone, 0x7fa9c6, 0.6),
        lit: 0xf2faff,
        mortar: mix(tones.stone, 0xc4e0f2, 0.6),
        edge: mix(tones.rock, 0x2c4a60, 0.5),
        crack: 0xf4fbff,
        glow: undefined,
        moss: undefined,
        rubble: mix(tones.stone, 0xd6ecfa, 0.55),
        rubbleFace: mix(tones.stone, 0x7fa9c6, 0.45),
        dust: 0xe4eef4,
        shadow: BREAKABLE_WALL_LOOK.shadow,
      };
    case "wilds":
    case "marsh":
    case "jungle":
    case "coast":
      return {
        courses: "fieldstone",
        top: mix(tones.rock, tones.stone, 0.4),
        face: shade(tones.rock, 0.12),
        lit: mix(tones.rock, tones.stone, 0.75),
        mortar: shade(tones.rock, 0.5),
        edge: shade(tones.rock, 0.75),
        crack: shade(tones.rock, 0.8),
        glow: undefined,
        moss: mix(tones.plant, 0x7a9a4a, 0.35),
        rubble: mix(tones.rock, tones.stone, 0.3),
        rubbleFace: shade(tones.rock, 0.25),
        dust: mix(tones.ground, tones.stone, 0.5),
        shadow: BREAKABLE_WALL_LOOK.shadow,
      };
    case "cavern":
      // A stalagmite wall: the slate in rough blocks, no moss, no glow.
      return {
        courses: "blocks",
        top: mix(tones.rock, tones.stone, 0.22),
        face: shade(tones.rock, 0.1),
        lit: mix(tones.rock, tones.stone, 0.6),
        mortar: shade(tones.rock, 0.6),
        edge: shade(tones.rock, 0.8),
        crack: shade(tones.rock, 0.85),
        glow: undefined,
        moss: undefined,
        rubble: mix(tones.rock, tones.stone, 0.15),
        rubbleFace: shade(tones.rock, 0.4),
        dust: mix(tones.ground, tones.stone, 0.45),
        shadow: BREAKABLE_WALL_LOOK.shadow,
      };
    case "hall":
    case "heights": {
      const { courses, glow, moss, ...colours } = BREAKABLE_WALL_LOOK;
      return { courses, glow, moss, ...tintAll(colours, () => "rock", tones) };
    }
  }
}

/**
 * The material a map's breakable walls are (#3370), under its Ascent act's
 * rock (#3618): a map of one layer's are stone whatever its biome.
 */
export function breakableLook(map: MapLook & { readonly layerCount: number }): BreakableLook {
  return map.layerCount > 1 ? materialsOf(map).breakable : BREAKABLE_WALL_LOOK;
}

/** Paving on a map of one layer (#3210): laid in the flat palette's tones, on the scene's background. */
const FLAT_PAVING = pavingColours({
  ground: ARENA_BACKGROUND,
  rock: FLAT.wallTop,
  stone: FLAT.deckTop,
  wood: HALL_TONES.wood,
  earth: shade(HALL_TONES.earth, 0.5),
  plant: HALL_TONES.plant,
});

/** The colours a map's paving is drawn in: a map of one layer's are flat whatever its biome. */
export function pavingPalette(
  map: MapLook & { readonly layerCount: number },
): Record<StonePavingLook, PavingLookColours> {
  return map.layerCount > 1 ? materialsOf(map).paving : FLAT_PAVING;
}
