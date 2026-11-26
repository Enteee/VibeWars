/**
 * Underruns from the output clock (#507). `getOutputTimestamp()` pairs the
 * audio clock with the wall clock at the moment the output played. While the
 * output plays, both advance together. When the render thread delivers a
 * block late, the device plays silence and the audio clock falls behind the
 * wall clock: that gap is the crackle, in every browser that has the API
 * (Chromium's `playoutStats` is not in Firefox).
 */

/** Drift this small is clock skew, not a block that was late. */
export const CLOCK_SKEW_MS = 2;

/** The part of an `AudioContext` the probe reads. */
export interface OutputClock {
  readonly state: AudioContextState;
  getOutputTimestamp?(): { contextTime?: number; performanceTime?: number };
  addEventListener?(type: "statechange", listener: () => void): void;
}

/** One second's underruns; `null` where the browser cannot say. */
export interface UnderrunReadings {
  /** Readings this second whose drift was over the skew band: 0 or 1. */
  readonly underruns: number | null;
  /** Wall time that passed with no audio rendered since the last reading, in ms. */
  readonly underrunMs: number | null;
}

export interface UnderrunProbe {
  /** Read the clocks, and compare them with the last reading. */
  take(): UnderrunReadings;
}

interface Reading {
  readonly contextTime: number;
  readonly performanceTime: number;
}

export function createUnderrunProbe(context: OutputClock): UnderrunProbe {
  let last: Reading | undefined;
  // A suspend that starts and ends between two readings stops the audio
  // clock while the wall clock runs on; it must not count.
  context.addEventListener?.("statechange", () => {
    last = undefined;
  });
  return {
    take() {
      if (context.getOutputTimestamp === undefined) {
        return { underruns: null, underrunMs: null };
      }
      const { contextTime, performanceTime } = context.getOutputTimestamp();
      // Zeros are what a context that has not played yet reports.
      if (
        typeof contextTime !== "number" ||
        typeof performanceTime !== "number" ||
        (contextTime === 0 && performanceTime === 0)
      ) {
        last = undefined;
        return { underruns: null, underrunMs: null };
      }
      if (context.state !== "running") {
        last = undefined;
        return { underruns: 0, underrunMs: 0 };
      }
      const previous = last;
      last = { contextTime, performanceTime };
      if (previous === undefined) {
        return { underruns: 0, underrunMs: 0 };
      }
      const drift =
        performanceTime - previous.performanceTime - (contextTime - previous.contextTime) * 1000;
      return drift > CLOCK_SKEW_MS
        ? { underruns: 1, underrunMs: drift }
        : { underruns: 0, underrunMs: 0 };
    },
  };
}
