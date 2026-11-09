/**
 * The explicit draw order of a layered arena (ADR-0051, #2810): terrain,
 * ground characters, walls, supports, side faces, decks, elevated
 * characters, effects, UI, as plain numbers. One stack per layer: a deck
 * of layer `n` closes the stack below it, so whoever stands under it
 * draws beneath it and whoever stands on it draws above.
 */

/** A body's parts on one character band, in the order they draw. */
export type CharacterPart = "body" | "glyph" | "marks";

export type RenderItem =
  | { readonly kind: "terrain" }
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
const CHARACTER_PART: Record<CharacterPart, number> = { body: 1, glyph: 1.2, marks: 1.4 };
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
export const CHARACTER_BANDS = 3;

/**
 * The character band a body on `layer` draws in. On a map of one layer
 * nobody is under anything, so everyone stands in front of the walls, as
 * the arena has always drawn them.
 */
export function characterBand(layer: number, layerCount: number): number {
  return layerCount === 1 ? 1 : layer;
}

/** World units a layer lifts what stands on it: presentation only (ADR-0051). */
export const ELEVATION_STEP = 28;

/** How long a body takes to settle at a new layer's height, in seconds. */
export const ELEVATION_EASE_SECONDS = 0.15;

/** The drawn lift of `layer`. */
export function elevationOf(layer: number): number {
  return layer * ELEVATION_STEP;
}

/**
 * The lift `dt` seconds on from `current`, on its way to `target`: one
 * layer's height every `ELEVATION_EASE_SECONDS`, and never past it.
 */
export function easeElevation(current: number, target: number, dt: number): number {
  const reach = (ELEVATION_STEP / ELEVATION_EASE_SECONDS) * dt;
  return current < target ? Math.min(current + reach, target) : Math.max(current - reach, target);
}
