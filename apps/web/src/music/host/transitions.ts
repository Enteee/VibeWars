import type { LandOn, MusicLevel } from "../host-protocol.js";

/**
 * When and how loudly things change in the music host, in cycles. Pure,
 * so the timing of a switch is tested without an audio engine. The model
 * is ADR-0058's.
 *
 * Every change lands at or after `position`, the end of what the scheduler
 * has already queried: an event before it has been handed to the audio
 * thread and can no longer be changed.
 */

/** The first whole cycle after `position`: where a new intensity starts. */
export function nextCycle(position: number): number {
  return Math.floor(position) + 1;
}

/** How many cycles past the earliest bar a switch waits to land on a phrase instead (#3983). */
export const PHRASE_WAIT_CYCLES = 2;

/**
 * Where a switch away from a track lands (#3983): the first bar of the
 * track with room for its whole fade-out, `fadeCycles`, after `position`.
 * A phrase boundary at most `PHRASE_WAIT_CYCLES` later is waited for; a
 * match start (#2530) never waits.
 *
 * @param origin the cycle the track started on, its first bar
 */
export function switchLanding(
  landOn: LandOn,
  position: number,
  origin: number,
  phraseCycles: number,
  fadeCycles: number,
): number {
  const bar = origin + Math.ceil(position + fadeCycles - origin);
  if (landOn === "cycle") {
    return bar;
  }
  const phrase = origin + Math.ceil((bar - origin) / phraseCycles) * phraseCycles;
  return phrase - bar <= PHRASE_WAIT_CYCLES ? phrase : bar;
}

/**
 * How loud one side of a fade is at `cycle`: rising from 0 to 1 over
 * `[from, from + cycles)`, or falling the other way. Equal power: a
 * linear fade sounds as if it dips in the middle (#3530).
 */
export function fadeGain(cycle: number, from: number, cycles: number, side: "in" | "out"): number {
  const progress = cycles <= 0 ? 1 : Math.min(1, Math.max(0, (cycle - from) / cycles));
  const angle = (progress * Math.PI) / 2;
  return side === "in" ? Math.sin(angle) : Math.cos(angle);
}

/** How loud a track is at a cycle of the scheduler's clock, 0 to 1. */
export type Envelope = (cycle: number) => number;

/**
 * How loud a note from `begin` for `duration` cycles plays under `envelope`: the louder
 * of its level at its onset and at its midpoint. A note on a fade-in's
 * first beat would be silent at its onset, and a pad as long as the fade
 * would not fade at all; at its midpoint it enters part way (#3983). A
 * fade-out keeps the onset's level.
 */
export function noteGain(envelope: Envelope, begin: number, duration: number): number {
  return Math.max(envelope(begin), envelope(begin + duration / 2));
}

/** A track at full level. */
export const FULL: Envelope = () => 1;

/** A track fading in over `[from, from + cycles)`, silent before. */
export function fadingIn(from: number, cycles: number): Envelope {
  return (cycle) => fadeGain(cycle, from, cycles, "in");
}

/**
 * `envelope` fading to silence over `[from, from + cycles)`, from the
 * level it has on `from`: a track still fading in fades back out from
 * where it got to, never jumping up first (#3983).
 */
export function fadingOut(envelope: Envelope, from: number, cycles: number): Envelope {
  return (cycle) =>
    cycle < from ? envelope(cycle) : envelope(from) * fadeGain(cycle, from, cycles, "out");
}

/** What the host plays, as far as a switch is concerned. */
export interface SwitchState {
  readonly playing: string;
  /** A switch to `next`: the playing track fades out from `fadesFrom`, and `next` fades in from `lands`. */
  readonly switching?: {
    readonly next: string;
    readonly fadesFrom: number;
    readonly lands: number;
  };
}

/**
 * What a request to switch to `trackId` does (#3530, #3983). The newest
 * request wins, only two tracks are ever heard at once, and no track's
 * level ever jumps.
 *
 * - `start`: no switch is planned; fade the playing track out.
 * - `replace`: the planned switch has not started to fade; plan this one
 *   from the playing track instead, so the replaced one never sounds.
 * - `cancel`: back to the playing track before its fade starts; drop it.
 * - `retarget`: the playing track is fading out; this one lands where
 *   the planned one would have. The playing track itself fades back in.
 * - `restart`: the planned track is fading in; it becomes the playing
 *   track, and fades back out from its level for this one.
 * - `keep`: already playing, or already the switch's target.
 */
export type SwitchPlan = "start" | "replace" | "cancel" | "retarget" | "restart" | "keep";

export function planSwitch(state: SwitchState, trackId: string, position: number): SwitchPlan {
  const { playing, switching } = state;
  if (switching === undefined) {
    return trackId === playing ? "keep" : "start";
  }
  if (trackId === switching.next) {
    return "keep";
  }
  if (position < switching.fadesFrom) {
    return trackId === playing ? "cancel" : "replace";
  }
  return position < switching.lands ? "retarget" : "restart";
}

/** An intensity, and the cycle it starts on. */
export interface LevelChange {
  readonly from: number;
  readonly level: MusicLevel;
}

/** How many cycles a layer takes to fade in or out when the intensity crosses it (#3983). */
export const LAYER_FADE_CYCLES = 1;

/**
 * The schedule with `level` from cycle `from` on (#3983). A rise climbs
 * one level per cycle, so each layer is heard entering; a fall lands at
 * once. A later change replaces any that start at or after it.
 *
 * Changes long past are dropped: the first one kept is where every layer
 * has settled by `from - 1`, the earliest cycle still to be queried.
 */
export function scheduleLevel(
  changes: readonly LevelChange[],
  level: MusicLevel,
  from: number,
): LevelChange[] {
  const earlier = changes.filter((change) => change.from < from);
  const settled = from - 1 - LAYER_FADE_CYCLES;
  const base = earlier.findLastIndex((change) => change.from <= settled);
  const kept = earlier.slice(Math.max(base, 0));
  const current = levelAt(kept, from);
  if (level <= current) {
    return [...kept, { from, level }];
  }
  const steps: LevelChange[] = [];
  for (let step = current + 1; step <= level; step++) {
    steps.push({ from: from + steps.length, level: step as MusicLevel });
  }
  return [...kept, ...steps];
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

/**
 * How loud the layer that plays from intensity `n` is at `cycle` (#3983):
 * it fades in over `LAYER_FADE_CYCLES` from the change that reaches `n`,
 * and out from the one that drops below it, from wherever it got to. The
 * first change is where the schedule starts, already settled.
 */
export function layerGain(changes: readonly LevelChange[], n: number, cycle: number): number {
  return layerAt(changes, n, cycle).gain;
}

/**
 * Whether a note starting on `cycle` belongs to the layer that plays from
 * intensity `n`: the layer is on there, or still fading out. A note that
 * starts before its layer comes in stays out, even if it would still be
 * sounding once it has.
 */
export function layerHeard(changes: readonly LevelChange[], n: number, cycle: number): boolean {
  const { on, gain } = layerAt(changes, n, cycle);
  return on || gain > 0;
}

function layerAt(
  changes: readonly LevelChange[],
  n: number,
  cycle: number,
): { readonly on: boolean; readonly gain: number } {
  let on = n <= 0;
  /** The fade under way: its start and level there; none for a settled layer. */
  let since = -Infinity;
  let start = on ? 1 : 0;
  const gainAt = (at: number): number => {
    const progress = Math.max(0, (at - since) / LAYER_FADE_CYCLES);
    if (progress >= 1) {
      return on ? 1 : 0;
    }
    const angle = (progress * Math.PI) / 2;
    return on ? start + (1 - start) * Math.sin(angle) : start * Math.cos(angle);
  };
  for (const [index, change] of changes.entries()) {
    if (change.from > cycle) {
      break;
    }
    const reached = change.level >= n;
    if (index === 0) {
      on = reached;
      start = reached ? 1 : 0;
      since = -Infinity;
    } else if (reached !== on) {
      start = gainAt(change.from);
      on = reached;
      since = change.from;
    }
  }
  return { on, gain: gainAt(cycle) };
}
