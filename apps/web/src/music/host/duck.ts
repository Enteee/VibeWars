import type { GainParam } from "./bus-gate.js";

/**
 * A sting ducks the track under it (#3983): the track's orbits drop 6 dB
 * over `DUCK_ATTACK_SECONDS` when a sting note starts, stay there while
 * the sting sounds, and come back over a beat after its last note ends.
 * The sting plays on an orbit of its own, `STING_ORBIT`, which is not
 * ducked. One duck at a time: a sting note during a duck extends it,
 * never deepens it.
 */

/** The orbit a sting plays on, which no track uses. */
export const STING_ORBIT = 9;
/** The track's level under a sting: −6 dB. */
export const DUCK_GAIN = 10 ** (-6 / 20);
/** How long the track takes to duck. */
export const DUCK_ATTACK_SECONDS = 0.05;

/** A duck as scheduled: when it starts and from what level, when it holds to, and how long it releases. */
export interface DuckShape {
  readonly at: number;
  readonly from: number;
  readonly holdUntil: number;
  readonly release: number;
}

/** The track's level at `time` under `shape`, on the audio clock. */
export function duckGain(shape: DuckShape | undefined, time: number): number {
  if (shape === undefined) {
    return 1;
  }
  const { at, from, holdUntil, release } = shape;
  if (time <= at) {
    return from;
  }
  if (time < at + DUCK_ATTACK_SECONDS) {
    return from + ((DUCK_GAIN - from) * (time - at)) / DUCK_ATTACK_SECONDS;
  }
  if (time <= holdUntil) {
    return DUCK_GAIN;
  }
  if (time < holdUntil + release) {
    return DUCK_GAIN + ((1 - DUCK_GAIN) * (time - holdUntil)) / release;
  }
  return 1;
}

export interface Duck {
  /**
   * A sting note from `time` for `seconds`: duck the track by then, and
   * hold until it ends, releasing over `beatSeconds`.
   */
  note(time: number, seconds: number, beatSeconds: number): void;
}

/** A duck that drives the gains `params` returns, each time a note asks. */
export function duck(params: () => readonly GainParam[]): Duck {
  let shape: DuckShape | undefined;
  return {
    note(time, seconds, beatSeconds) {
      // Notes of one slot come in any order; the duck only moves forward.
      const at = Math.max(time, shape?.at ?? -Infinity);
      const from = duckGain(shape, at);
      const held =
        shape !== undefined && at < shape.holdUntil + shape.release ? shape.holdUntil : -Infinity;
      const holdUntil = Math.max(at + seconds, at + DUCK_ATTACK_SECONDS, held);
      shape = { at, from, holdUntil, release: beatSeconds };
      for (const param of params()) {
        param.cancelScheduledValues(at);
        param.setValueAtTime(from, at);
        param.linearRampToValueAtTime(DUCK_GAIN, at + DUCK_ATTACK_SECONDS);
        param.setValueAtTime(DUCK_GAIN, holdUntil);
        param.linearRampToValueAtTime(1, holdUntil + beatSeconds);
      }
    },
  };
}
