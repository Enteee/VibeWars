/**
 * ADR-0056's readability rules as data checks: a rule of the catalog, not
 * a review taste. Each catalog entry passes in a test, and a new slot
 * passes before it ships.
 */

import { BUBBLE_COLOUR, DROP_COLOUR, FLAME_COLOUR } from "../render/body-conditions.js";
import { ENCHANTMENT_COLOUR, HEX_COLOUR, STANCE_COLOUR } from "../render/body-rings.js";
import {
  DEATH_SECONDS,
  RESPAWN_SECONDS,
  deathProgress,
  respawnRing,
} from "../render/body-reactions.js";
import { STYLE_MOTES } from "../render/cosmetic-reactions.js";
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
    case "swing":
    case "spawn":
    case "dissolve":
      return [look.colour];
    case "title":
      return [look.colour, look.glow];
    case "emblemFrame":
      // Neither hues: the cape's own trim, or a metal `metalProblems` holds near grey.
      return [];
  }
}

/**
 * What an emblem frame breaks (#3581): its metal is a neutral tone, a
 * hand's width or less from grey on the colour wheel, so it reads as no
 * hue, never as a team's or a cue's.
 */
function metalProblems(entry: CosmeticEntry): readonly string[] {
  const { look } = entry;
  if (look.kind !== "emblemFrame" || look.colour === "trim") {
    return [];
  }
  return wheelDistance(look.colour, 0) > HAND
    ? [`${entry.id}: ${hex(look.colour)} is no neutral metal`]
    : [];
}

/** How many instants of a spawn or a fall the readability check samples. */
const READABLE_SAMPLES = 50;

/**
 * What a spawn or death style breaks of the default timing (#3580): it
 * runs the default's time, and at no instant is the returning body's
 * team ring or the falling body fainter than by default.
 */
function timingProblems(entry: CosmeticEntry): readonly string[] {
  const { look } = entry;
  if (look.kind !== "spawn" && look.kind !== "dissolve") {
    return [];
  }
  const plainSeconds = look.kind === "spawn" ? RESPAWN_SECONDS : DEATH_SECONDS;
  const problems: string[] = [];
  if (look.motes < 1 || look.motes > STYLE_MOTES) {
    problems.push(`${entry.id}: ${String(look.motes)} motes, not 1 to ${String(STYLE_MOTES)}`);
  }
  if (look.seconds !== plainSeconds) {
    problems.push(
      `${entry.id}: ${String(look.seconds)} s, not the default ${String(plainSeconds)} s`,
    );
  }
  for (let i = 0; i <= READABLE_SAMPLES; i += 1) {
    const age = (plainSeconds * i) / READABLE_SAMPLES;
    const alpha =
      look.kind === "spawn"
        ? respawnRing(age, look.seconds).alpha
        : 1 - deathProgress(age, look.seconds);
    const plain =
      look.kind === "spawn"
        ? respawnRing(age, plainSeconds).alpha
        : 1 - deathProgress(age, plainSeconds);
    if (alpha < plain) {
      problems.push(`${entry.id}: the body fainter than by default at ${age.toFixed(2)} s`);
      break;
    }
  }
  return problems;
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
  // Under the body, rings and marks draw over it; anywhere else, it is no ground effect.
  if (look.layer !== "under-body" && look.ground !== null) {
    problems.push(`${entry.id}: a ground effect on the ${look.layer}`);
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
  problems.push(...timingProblems(entry), ...metalProblems(entry));
  return problems;
}
