/**
 * The music bus's gain around stop and play (#446). The scheduler works
 * `LEAD_SECONDS` ahead of the audio clock, so notes already handed to Web
 * Audio would sound for that long after a stop. A stop closes the bus at
 * once, and the next play opens it again when its first note can sound.
 */

/** The part of an `AudioParam` the gate drives. */
export interface GainParam {
  readonly value: number;
  cancelScheduledValues(time: number): void;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
}

/** How long a stop takes to close the bus: short enough to be a stop, long enough not to click. */
export const STOP_RAMP_SECONDS = 0.05;

export interface BusGate {
  /** Close the bus now and hold it shut. */
  stop(): void;
  /** Open the bus, if a stop closed it, when the first note of what plays next can sound. */
  open(): void;
  /** Move to `gain` over `rampSeconds`. Shut stays shut: only the level the next open restores changes. */
  setVolume(gain: number, rampSeconds: number): void;
}

export function busGate(
  param: GainParam,
  now: () => number,
  lead: number,
  volume: number,
): BusGate {
  let level = volume;
  let shut = false;
  /** When a pending open lands, if one is waiting. */
  let opensAt = -Infinity;

  /** Hold the gain where it is now, dropping whatever was scheduled. */
  const hold = (time: number): void => {
    const current = param.value;
    param.cancelScheduledValues(time);
    param.setValueAtTime(current, time);
  };

  return {
    stop() {
      const time = now();
      shut = true;
      opensAt = -Infinity;
      hold(time);
      param.linearRampToValueAtTime(0, time + STOP_RAMP_SECONDS);
    },
    open() {
      if (!shut) {
        return;
      }
      const time = now();
      shut = false;
      opensAt = time + lead;
      hold(time);
      param.setValueAtTime(level, opensAt);
    },
    setVolume(gain, rampSeconds) {
      level = gain;
      if (shut) {
        return;
      }
      const time = now();
      hold(time);
      if (time < opensAt) {
        // Still closed, and opening at `opensAt`: open to the new level.
        param.setValueAtTime(level, opensAt);
        return;
      }
      param.linearRampToValueAtTime(level, time + rampSeconds);
    },
  };
}
