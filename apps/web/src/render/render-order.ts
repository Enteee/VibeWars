/**
 * The explicit draw order of a layered arena (ADR-0051, #2810): floor,
 * ground water, ground effects, terrain, ground characters, walls, supports, side faces, decks, elevated
 * characters, effects, UI, as plain numbers. One stack per layer: a deck
 * of layer `n` closes the stack below it, so whoever stands under it
 * draws beneath it and whoever stands on it draws above.
 *
 * Layers here are indices from the bottom, not from the ground (#2973):
 * on a map with pits, layer 0 is the pits' floor, and the ground over a
 * tunnel or a pit's near lip draws as a deck of the ground's layer.
 */

/** A body's parts on one character band, in the order they draw. */
export type CharacterPart = "body" | "glyph" | "marks";

/** A body of water's parts (#2984): its fill and shore, then the ripples on it. */
export type WaterPart = "surface" | "ripples";

/** An effect zone's parts (#3052): its painted ground, then its moving marks and edge. */
export type ZonePart = "ground" | "marks";

export type RenderItem =
  | { readonly kind: "outside" }
  | { readonly kind: "floor" }
  | { readonly kind: "pit" }
  | { readonly kind: "water"; readonly layer: number; readonly part: WaterPart }
  | { readonly kind: "zone"; readonly layer: number; readonly part: ZonePart }
  | { readonly kind: "ground-effect"; readonly layer: number }
  | { readonly kind: "fog"; readonly layer: number }
  | { readonly kind: "plume"; readonly band: number }
  | { readonly kind: "weather" }
  | { readonly kind: "terrain" }
  | { readonly kind: "lighting"; readonly layer: number }
  | { readonly kind: "lit-ground-effect" }
  | { readonly kind: "light-mark"; readonly layer: number }
  | { readonly kind: "character"; readonly band: number; readonly part: CharacterPart }
  | { readonly kind: "wall"; readonly layer: number }
  | { readonly kind: "support"; readonly deckLayer: number }
  | { readonly kind: "side-face"; readonly deckLayer: number }
  | { readonly kind: "deck"; readonly deckLayer: number }
  | { readonly kind: "ramp"; readonly upperLayer: number }
  | { readonly kind: "hidden-outline" }
  | { readonly kind: "effect" }
  | { readonly kind: "cast-badge" }
  | { readonly kind: "ui" }
  | { readonly kind: "edge-marker" };

const LAYER_STACK = 10;
/** The land outside a ground outline (#3066): under the floor, which is the ground inside it. */
const OUTSIDE = -3;
/**
 * A pit's sunk floor, far wall and ramp (#2973): over the floor, under the
 * water, wards and bodies in it, and under the ground's lip in front of it.
 */
const PIT = -1.8;
/** Over the grid and deck shadows, under the first body; the wards draw just over it. */
const GROUND_LIGHTING = 0.5;
const LIT_GROUND_EFFECT = 0.6;
/**
 * A ward or trap on a deck (#2979): over its layer's deck, ramp, water and
 * lighting, which never darkens it, under whoever stands there.
 */
const DECK_GROUND_EFFECT = 0.5;
/** A deck layer's lighting: over its side faces, deck and ramp, under whoever stands there. */
const DECK_LIGHTING = 5.8;
/**
 * A torch or hearth (#2989): over its layer's lighting and wards, under
 * whoever stands on it, so a body crossing a hearth stays in sight.
 */
const LIGHT_MARK = 0.8;
const CHARACTER_PART: Record<CharacterPart, number> = { body: 1, glyph: 1.2, marks: 1.4 };
/**
 * Ground water sits on the floor and under the ward and trap circles
 * (#2984), so they stay readable on it; water on a deck sits on that deck
 * and its ramp, under whoever stands there. Both are under their layer's
 * lighting, which lights them as it lights the floor.
 */
const GROUND_WATER: Record<WaterPart, number> = { surface: -1.6, ripples: -1.5 };
const DECK_WATER: Record<WaterPart, number> = { surface: 5.6, ripples: 5.7 };
/**
 * An effect zone (ADR-0053): over its layer's water and lighting, which
 * never darkens it (ADR-0052: what matters to the fight is drawn unlit),
 * and under its torches and whoever stands in it.
 */
const GROUND_ZONE: Record<ZonePart, number> = { ground: 0.53, marks: 0.55 };
const DECK_ZONE: Record<ZonePart, number> = { ground: 5.83, marks: 5.85 };
/**
 * A fog bank (#3032): over its layer's ground, water, light and zones,
 * under its wards, torches and whoever stands in it, so the haze never
 * hides a body, its ring or a telegraph.
 */
const GROUND_FOG = 0.57;
const DECK_FOG = 5.9;
/** Smoke or steam (#3032): over the bodies on its band, under its walls and any deck above. */
const PLUME = 1.6;
/** Rain or snow (#3032): over the whole world, under hidden outlines, effects and the HUD. */
const WEATHER = 89;
const WALL = 2;
const SUPPORT = 3;
const SIDE_FACE = 4;
const DECK = 5;
const RAMP = 5.5;
const HIDDEN_OUTLINE = 90;
const EFFECT = 100;
const CAST_BADGE = 100.5;
const UI = 110;
const EDGE_MARKER = 120;

/** Where `item` draws: higher is in front. */
export function renderOrder(item: RenderItem): number {
  switch (item.kind) {
    case "outside":
      return OUTSIDE;
    case "floor":
      return -2;
    case "pit":
      return PIT;
    case "water":
      return item.layer === 0
        ? GROUND_WATER[item.part]
        : (item.layer - 1) * LAYER_STACK + DECK_WATER[item.part];
    case "zone":
      return item.layer === 0
        ? GROUND_ZONE[item.part]
        : (item.layer - 1) * LAYER_STACK + DECK_ZONE[item.part];
    case "fog":
      return item.layer === 0 ? GROUND_FOG : (item.layer - 1) * LAYER_STACK + DECK_FOG;
    case "plume":
      return item.band * LAYER_STACK + PLUME;
    case "weather":
      return WEATHER;
    case "ground-effect":
      return item.layer === 0 ? -1 : item.layer * LAYER_STACK + DECK_GROUND_EFFECT;
    case "lighting":
      return item.layer === 0 ? GROUND_LIGHTING : (item.layer - 1) * LAYER_STACK + DECK_LIGHTING;
    case "lit-ground-effect":
      return LIT_GROUND_EFFECT;
    case "light-mark":
      return item.layer * LAYER_STACK + LIGHT_MARK;
    case "terrain":
      return 0;
    case "character":
      return item.band * LAYER_STACK + CHARACTER_PART[item.part];
    case "wall":
      return item.layer * LAYER_STACK + WALL;
    case "support":
      return (item.deckLayer - 1) * LAYER_STACK + SUPPORT;
    case "side-face":
      return (item.deckLayer - 1) * LAYER_STACK + SIDE_FACE;
    case "deck":
      return (item.deckLayer - 1) * LAYER_STACK + DECK;
    case "ramp":
      return (item.upperLayer - 1) * LAYER_STACK + RAMP;
    case "hidden-outline":
      return HIDDEN_OUTLINE;
    case "effect":
      return EFFECT;
    case "cast-badge":
      return CAST_BADGE;
    case "ui":
      return UI;
    case "edge-marker":
      return EDGE_MARKER;
  }
}

/** How many character bands a scene keeps: one per layer a map can have. */
export const CHARACTER_BANDS = 4;

/**
 * The character band a body on `layer` draws in. On a map of one layer
 * nobody is under anything, so everyone stands in front of the walls, as
 * the arena has always drawn them.
 */
export function characterBand(layer: number, layerCount: number): number {
  return layerCount === 1 ? 1 : layer;
}

/** World units a layer lifts what stands on it: presentation only (ADR-0051). */
export const ELEVATION_STEP = 56;

/** How long a body takes to settle at a new layer's height, in seconds. */
export const ELEVATION_EASE_SECONDS = 0.15;

/** The drawn lift of `layer` on a map whose ground is `ground`: below it, negative (#2973). */
export function elevationOf(layer: number, ground: number): number {
  return (layer - ground) * ELEVATION_STEP;
}

/**
 * The lift `dt` seconds on from `current`, on its way to `target`: one
 * layer's height every `ELEVATION_EASE_SECONDS`, and never past it.
 */
export function easeElevation(current: number, target: number, dt: number): number {
  const reach = (ELEVATION_STEP / ELEVATION_EASE_SECONDS) * dt;
  return current < target ? Math.min(current + reach, target) : Math.max(current - reach, target);
}
