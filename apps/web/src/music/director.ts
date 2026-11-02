import { seedFromString } from "@vibewars/game-core";

import { MENU_TRACK, mapTrack } from "./fixed-tracks.js";
import { moodsFor } from "./map-moods.js";
import type { Mood } from "./mood.js";

/**
 * The music director (#366 §3.5, #370): from what the player sees, which
 * track plays and how intense it is. Pure, and the clock is an input, so
 * the hysteresis is tested without waiting.
 */

/** Below this share of health, yours or an ally's, the music peaks. */
export const PEAK_HEALTH_FRACTION = 0.25;
/** How far back a hit still counts as fighting. */
export const HIT_WINDOW_MS = 5_000;
/** Calm needed to fall one level. */
export const FALL_STEP_MS = 8_000;
/** The least time level 3 is held once reached. */
export const PEAK_HOLD_MS = 6_000;

export type Intensity = 0 | 1 | 2 | 3;

const ONE_LOWER: Readonly<Record<Intensity, Intensity>> = { 0: 0, 1: 0, 2: 1, 3: 2 };

/** Every level, by its number. */
const INTENSITIES: readonly Intensity[] = [0, 1, 2, 3];

/** A menu depth, already clamped to its song's layers, as a level. */
const MENU_LEVEL: readonly Intensity[] = [0, 1];

export type MusicMode =
  | { readonly kind: "auto" }
  | { readonly kind: "shuffle" }
  | { readonly kind: "pinned"; readonly trackId: string }
  | { readonly kind: "off" };

/** Only what the director needs from a track, so it does not depend on the manifest file. */
export interface TrackChoice {
  readonly id: string;
  /** The first entry is the primary mood. */
  readonly moods: readonly Mood[];
  /** Highest intensity the track responds to, plus one. */
  readonly layers: number;
}

export interface MusicInput {
  readonly screen: "menu" | "training" | "match" | "result";
  /** Menu and training: how deep in the menus the player is (#1993). */
  readonly menuDepth: 0 | 1 | null;
  /** Training and match only. */
  readonly mapId: string | null;
  /** The map id and the match's start; a rematch gets a new one. */
  readonly matchSeed: string | null;
  /** Result only; `null` on a draw. */
  readonly result: "victory" | "defeat" | null;
  readonly self: { readonly alive: boolean; readonly healthFraction: number } | null;
  /** Hostile combat events with you as the source. */
  readonly hitsDealtLast5s: number;
  /** Hostile combat events with you as the target. */
  readonly hitsTakenLast5s: number;
  /** A living enemy within `ENGAGE_RANGE` of you. */
  readonly enemyInRange: boolean;
  /** Living allies other than you; `null` with none. */
  readonly lowestAllyHealthFraction: number | null;
  /** Including you. */
  readonly aliveAllies: number | null;
  readonly aliveEnemies: number | null;
  /** Players per side at match start. */
  readonly teamSize: number | null;
  readonly nowMs: number;
}

export interface MusicState {
  /** `null` is silence: mode `off`, or no track fits. */
  readonly trackId: string | null;
  readonly intensity: Intensity;
  /** When `intensity` was last reached or last called for; falling counts from here. */
  readonly intensitySinceMs: number;
  /** Where the player is; the track changes only with it. */
  readonly context: string;
}

/**
 * The context, and for a result the key `map-moods.ts` knows it by. Every
 * menu is one context, so moving between them keeps the song (#1993); the
 * builder's Training Ground is a menu too (#2020).
 */
function contextOf(input: MusicInput): string {
  switch (input.screen) {
    case "menu":
    case "training":
      return "menu";
    case "match":
      return `match:${input.mapId ?? ""}`;
    case "result":
      return input.result === null ? "result" : `result-${input.result}`;
  }
}

/**
 * The level the fight calls for right now, before any hysteresis. A menu's
 * is its depth, up to the top of the `layers` its song has (#1993); the
 * Training Ground's, the higher of its fight and its depth (#2020).
 */
export function targetIntensity(input: MusicInput, layers: number): Intensity {
  const depth = MENU_LEVEL[Math.max(0, Math.min(input.menuDepth ?? 0, layers - 1))] ?? 0;
  switch (input.screen) {
    case "menu":
      return depth;
    case "training": {
      const fight = Math.min(fightIntensity(input), layers - 1);
      return INTENSITIES[Math.max(depth, fight)] ?? depth;
    }
    case "match":
      return fightIntensity(input);
    case "result":
      return 0;
  }
}

/** The level the fight in a match or the Training Ground calls for. */
function fightIntensity(input: MusicInput): Intensity {
  const { self } = input;
  if (!self?.alive) {
    return 0;
  }
  if (
    self.healthFraction < PEAK_HEALTH_FRACTION ||
    (input.lowestAllyHealthFraction !== null &&
      input.lowestAllyHealthFraction < PEAK_HEALTH_FRACTION) ||
    (input.teamSize !== null &&
      input.teamSize >= 2 &&
      input.aliveAllies === 1 &&
      input.aliveEnemies === 1)
  ) {
    return 3;
  }
  if (input.hitsDealtLast5s >= 1 && input.hitsTakenLast5s >= 1) {
    return 2;
  }
  if (input.enemyInRange || input.hitsDealtLast5s + input.hitsTakenLast5s >= 1) {
    return 1;
  }
  return 0;
}

/** One of `tracks`, the same one for the same `seed`. */
function pick(tracks: readonly TrackChoice[], seed: string): TrackChoice | undefined {
  return tracks.length === 0 ? undefined : tracks[seedFromString(seed) % tracks.length];
}

/** Auto's song: fixed on a menu and a map (#1993), by mood for a result. */
function autoTrack(input: MusicInput, seed: string, tracks: readonly TrackChoice[]): string | null {
  switch (input.screen) {
    case "menu":
    case "training":
      return MENU_TRACK;
    case "match":
      return mapTrack(input.mapId ?? "");
    case "result":
      return moodTrack(moodsFor(contextOf(input)), seed, tracks);
  }
}

function moodTrack(
  moods: readonly Mood[],
  seed: string,
  tracks: readonly TrackChoice[],
): string | null {
  const fits = tracks.filter((track) => track.moods.some((mood) => moods.includes(mood)));
  const primary = fits.filter(
    (track) => track.moods[0] !== undefined && moods.includes(track.moods[0]),
  );
  const epic = tracks.filter((track) => track.moods.includes("epic"));
  const from = [primary, fits, epic].find((candidates) => candidates.length > 0) ?? [];
  return pick(from, seed)?.id ?? null;
}

function chooseTrack(
  input: MusicInput,
  seed: string,
  mode: MusicMode,
  tracks: readonly TrackChoice[],
): string | null {
  switch (mode.kind) {
    case "off":
      return null;
    case "shuffle":
      return pick(tracks, seed)?.id ?? null;
    case "pinned":
      // A pinned id not in the manifest is wrong data: play as Auto.
      return tracks.some((track) => track.id === mode.trackId)
        ? mode.trackId
        : autoTrack(input, seed, tracks);
    case "auto":
      return autoTrack(input, seed, tracks);
  }
}

/**
 * What plays next. The track follows the context and the mode only, and
 * is the same for the same match, so a snapshot never changes it.
 * Intensity rises at once, falls one level per `FALL_STEP_MS` of calm, and
 * holds level 3 at least `PEAK_HOLD_MS`; a new context starts afresh.
 */
export function directMusic(
  input: MusicInput,
  prev: MusicState | null,
  mode: MusicMode,
  tracks: readonly TrackChoice[],
): MusicState {
  const context = contextOf(input);
  const trackId = chooseTrack(input, input.matchSeed ?? context, mode, tracks);
  const layers = tracks.find((track) => track.id === trackId)?.layers ?? 1;
  const target = targetIntensity(input, layers);
  const now = input.nowMs;
  // A menu's level is where the player is, not a fight to calm down from.
  if (prev?.context !== context || target >= prev.intensity || input.screen === "menu") {
    return { trackId, intensity: target, intensitySinceMs: now, context };
  }
  let { intensity, intensitySinceMs } = prev;
  // Each step counts from when it was due, not when it was seen, so a fall
  // keeps time however often this is called, and a long gap falls far.
  while (intensity > target) {
    const hold = intensity === 3 ? Math.max(FALL_STEP_MS, PEAK_HOLD_MS) : FALL_STEP_MS;
    if (now - intensitySinceMs < hold) {
      break;
    }
    intensity = ONE_LOWER[intensity];
    intensitySinceMs += hold;
  }
  return { trackId, intensity, intensitySinceMs, context };
}
