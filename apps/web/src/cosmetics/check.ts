/**
 * ADR-0056's readability rules as data checks: a rule of the catalog, not
 * a review taste. Each catalog entry passes in a test, and a new slot
 * passes before it ships.
 */

import { BUBBLE_COLOUR, DROP_COLOUR, FLAME_COLOUR } from "../render/body-conditions.js";
import { ENCHANTMENT_COLOUR, HEX_COLOUR, STANCE_COLOUR } from "../render/body-rings.js";
import { SKILL_ARC_COLOUR, teamColour } from "../render/arena-snapshot.js";
import { HAND, wheelDistance } from "../render/colour-wheel.js";
import { ZONE_LOOK } from "../render/zone-look.js";

import type { CosmeticEntry, CosmeticLook } from "./catalog.js";

/**
 * The hues a cue is read by: the teams', the conditions', hexes',
 * enchantments' and stances', a skill's arc and every zone's fill and rim.
 * A cosmetic stays a hand's width from each on the colour wheel.
 */
export const CUE_COLOURS: readonly number[] = [
  teamColour("ally"),
  teamColour("enemy"),
  teamColour("third"),
  FLAME_COLOUR,
  DROP_COLOUR,
  BUBBLE_COLOUR,
  HEX_COLOUR,
  ENCHANTMENT_COLOUR,
  STANCE_COLOUR,
  SKILL_ARC_COLOUR,
  ...Object.values(ZONE_LOOK).flatMap((look) => [look.fill, look.edge]),
];

/**
 * How far a ground effect reaches, as a share of the body's radius: an
 * aura past the body's rim, a trail mote from its centre. And its strongest alpha.
 */
export const GROUND_RADIUS_OF_BODY = 0.6;
export const GROUND_ALPHA = 0.35;

/** The colours `look` draws with. */
function coloursOf(look: CosmeticLook): readonly number[] {
  switch (look.kind) {
    case "frame":
    case "flame":
    case "trail":
    case "aura":
      return [look.colour];
    case "title":
      return [look.colour, look.glow];
  }
}

const hex = (colour: number): string => `#${colour.toString(16).padStart(6, "0")}`;

/**
 * What `entry` breaks of ADR-0056 §4, one line each; empty when it
 * passes. Silence needs no check: a look's `sound` can only be `null`.
 */
export function checkCosmetic(entry: CosmeticEntry): readonly string[] {
  const { look } = entry;
  const problems: string[] = [];
  for (const colour of coloursOf(look)) {
    for (const cue of CUE_COLOURS) {
      if (wheelDistance(colour, cue) < HAND) {
        problems.push(`${entry.id}: ${hex(colour)} reads as the cue ${hex(cue)}`);
      }
    }
  }
  // Under the body, rings and marks draw over it; on the plate, it is no ground effect.
  if (look.layer === "nameplate" && look.ground !== null) {
    problems.push(`${entry.id}: a ground effect on the name plate`);
  }
  if (look.layer === "under-body" && look.ground === null) {
    problems.push(`${entry.id}: on the ground with no fixed size`);
  }
  if (look.ground !== null) {
    if (look.ground.radiusOfBody > GROUND_RADIUS_OF_BODY) {
      problems.push(`${entry.id}: radius ${String(look.ground.radiusOfBody)} of the body`);
    }
    if (look.ground.alpha > GROUND_ALPHA) {
      problems.push(`${entry.id}: alpha ${String(look.ground.alpha)}`);
    }
  }
  return problems;
}
