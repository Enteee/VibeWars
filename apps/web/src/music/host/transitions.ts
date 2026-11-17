import type { LandOn, MusicLevel } from "../host-protocol.js";

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
 * Where a switch away from a track lands: its next phrase boundary, or the
 * next cycle when a match starts (#2530), which is that boundary too in
 * the phrase's last cycle.
 *
 * @param origin the cycle the track started on
 */
export function switchLanding(
  landOn: LandOn,
  position: number,
  origin: number,
  phraseCycles: number,
): number {
  return landOn === "cycle" ? nextCycle(position) : nextBoundary(position, origin, phraseCycles);
}

/**
 * How loud one side of a crossfade is at `cycle`: the new track rises from
 * 0 to 1 over `[from, from + cycles)`, the old one falls the other way.
 * Equal power, so the two together are as loud mid-fade as either alone:
 * a linear fade dips about 3 dB in the middle (#3530).
 */
export function fadeGain(cycle: number, from: number, cycles: number, side: "in" | "out"): number {
  const progress = cycles <= 0 ? 1 : Math.min(1, Math.max(0, (cycle - from) / cycles));
  const angle = (progress * Math.PI) / 2;
  return side === "in" ? Math.sin(angle) : Math.cos(angle);
}

/** What the host plays, as far as a switch is concerned. */
export interface SwitchState {
  readonly playing: string;
  /** A switch to `next`, landing on `from` and fading until it lands. */
  readonly switching?: { readonly next: string; readonly from: number };
}

/**
 * What a request to switch to `trackId` does (#3530), so that only two
 * tracks are ever heard: the one playing and the newest asked for.
 *
 * - `start`: no switch is planned; crossfade from the playing track.
 * - `replace`: the planned switch has not started yet; plan this one from
 *   the playing track instead, so the replaced one never sounds.
 * - `cancel`: back to the playing track before the switch starts; drop it.
 * - `hold`: the switch is fading; start this one from it once it lands.
 * - `keep`: already playing, or already the fading switch's target:
 *   nothing to start, and a held request is dropped.
 */
export type SwitchPlan = "start" | "replace" | "cancel" | "hold" | "keep";

export function planSwitch(state: SwitchState, trackId: string, position: number): SwitchPlan {
  const { playing, switching } = state;
  if (switching === undefined) {
    return trackId === playing ? "keep" : "start";
  }
  if (position < switching.from) {
    return trackId === playing ? "cancel" : "replace";
  }
  return trackId === switching.next ? "keep" : "hold";
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
