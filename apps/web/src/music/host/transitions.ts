import type { MusicLevel } from "../host-protocol.js";

/**
 * When things change in the music host, in cycles. Pure, so the timing of
 * a switch is tested without an audio engine.
 *
 * Every change lands at or after `position`, the end of what the scheduler
 * has already queried: an event before it has been handed to the audio
 * thread and can no longer be changed.
 */

/**
 * The first phrase boundary of a track after `position`: where a switch
 * away from it may land.
 *
 * @param origin the cycle the track started on
 */
export function nextBoundary(position: number, origin: number, phraseCycles: number): number {
  return origin + (Math.floor((position - origin) / phraseCycles) + 1) * phraseCycles;
}

/** The first whole cycle after `position`: where a new intensity starts. */
export function nextCycle(position: number): number {
  return Math.floor(position) + 1;
}

/**
 * How loud one side of a crossfade is at `cycle`: the new track rises from
 * 0 to 1 over `[from, from + cycles)`, the old one falls the other way.
 */
export function fadeGain(cycle: number, from: number, cycles: number, side: "in" | "out"): number {
  const progress = cycles <= 0 ? 1 : Math.min(1, Math.max(0, (cycle - from) / cycles));
  return side === "in" ? progress : 1 - progress;
}

/** An intensity, and the cycle it starts on. */
export interface LevelChange {
  readonly from: number;
  readonly level: MusicLevel;
}

/**
 * The schedule with `level` from cycle `from` on. A later change replaces
 * any that start at or after it; changes long past are dropped, keeping
 * the last one that still applies.
 */
export function scheduleLevel(
  changes: readonly LevelChange[],
  level: MusicLevel,
  from: number,
): LevelChange[] {
  const kept = changes.filter((change) => change.from < from);
  const current = kept.at(-1);
  return [...(current === undefined ? [] : [current]), { from, level }];
}

/** The intensity at `cycle`; 0 before the first change. */
export function levelAt(changes: readonly LevelChange[], cycle: number): MusicLevel {
  let level: MusicLevel = 0;
  for (const change of changes) {
    if (change.from <= cycle) {
      level = change.level;
    }
  }
  return level;
}
