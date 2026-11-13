import type { Biome, DeckLook, PavingLook, TransitionLook } from "@vibewars/game-maps/schema";

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

/** The colours of a map: a map of one layer is drawn flat whatever its biome. */
export function arenaPalette(map: {
  readonly layerCount: number;
  readonly biome: Biome;
}): ArenaPalette {
  return map.layerCount > 1 ? BIOME[map.biome].palette : FLAT;
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
interface BiomeTones {
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
function pavingColours(tones: BiomeTones): Record<PavingLook, PavingLookColours> {
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
/** A map's materials (#3172): its arena's colours, and each deck, transition and paving look's. */
export interface BiomeMaterials {
  readonly palette: ArenaPalette;
  readonly deck: Record<DeckLook, DeckLookColours>;
  readonly transition: Record<TransitionLook, TransitionLookColours>;
  readonly paving: Record<PavingLook, PavingLookColours>;
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

function biomeMaterials(tones: BiomeTones): BiomeMaterials {
  return {
    palette: tintAll(GRAPHIC_LAYERS, (slot) => PALETTE_MATERIAL[slot], tones),
    deck: lookColours(DECK_LOOK, DECK_MATERIAL, tones),
    transition: lookColours(TRANSITION_LOOK, TRANSITION_MATERIAL, tones),
    paving: pavingColours(tones),
  };
}

/** Each biome's materials (#3172), tinted from the hall's by its tones. */
export const BIOME: Record<Biome, BiomeMaterials> = {
  hall: biomeMaterials(BIOME_TONES.hall),
  heights: biomeMaterials(BIOME_TONES.heights),
  wilds: biomeMaterials(BIOME_TONES.wilds),
  desert: biomeMaterials(BIOME_TONES.desert),
};

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
export function pavingPalette(map: {
  readonly layerCount: number;
  readonly biome: Biome;
}): Record<PavingLook, PavingLookColours> {
  return map.layerCount > 1 ? BIOME[map.biome].paving : FLAT_PAVING;
}
