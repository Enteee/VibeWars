/**
 * `?capture=step` (#4006): frame-stepped capture for `scripts/promo`. Game
 * time moves only when the capture script calls `window.__captureStep(n)`,
 * one video frame at a time, so the recording is smooth however long a
 * frame takes to draw. Without the flag `now()` is `performance.now()` and
 * nothing here runs.
 *
 * Two things step: the host's clock (`startHostClock` hands its ticks here)
 * and the page's frames (the arena's Phaser loop, or the match view's own
 * loop when there is no arena).
 */

/** Frames per second of the recording. */
export const CAPTURE_FPS = 30;
const FRAME_MS = 1000 / CAPTURE_FPS;

type Tick = (seconds: number) => void;
type Frame = (timeMs: number, deltaMs: number) => void;

export interface CaptureClock {
  /** Whether game time is stepped by the capture script. */
  readonly stepping: boolean;
  /** Milliseconds: `performance.now()`, or the virtual time when stepping. */
  now(): number;
  /** The host's clock beat; returns the stop. Called with 1/30 s per frame. */
  onHostTick(tick: Tick): () => void;
  /** The page's frame driver; returns the stop. Called once per frame, after the host ticks. */
  onFrame(frame: Frame): () => void;
  /** Runs `frames` frames, resolving after the last one is drawn. */
  step(frames: number): Promise<void>;
}

/** Whether the page asked for frame-stepped capture: `?capture=step`. */
export function steppedCapture(search: string): boolean {
  return new URLSearchParams(search).get("capture") === "step";
}

/** Lets what the host just published reach the page before it draws. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Resolves once the browser has presented what was just drawn. */
function presented(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

export function createCaptureClock(
  search: string,
  realNow: () => number,
  waits: { settle(): Promise<void>; presented(): Promise<void> } = { settle, presented },
): CaptureClock {
  const stepping = steppedCapture(search);
  const ticks = new Set<Tick>();
  const frames = new Set<Frame>();
  let virtual = realNow();
  return {
    stepping,
    now: () => (stepping ? virtual : realNow()),
    onHostTick(tick) {
      ticks.add(tick);
      return () => {
        ticks.delete(tick);
      };
    },
    onFrame(frame) {
      frames.add(frame);
      return () => {
        frames.delete(frame);
      };
    },
    async step(count) {
      for (let i = 0; i < count; i += 1) {
        virtual += FRAME_MS;
        for (const tick of [...ticks]) {
          tick(1 / CAPTURE_FPS);
        }
        await waits.settle();
        for (const frame of [...frames]) {
          frame(virtual, FRAME_MS);
        }
        await waits.presented();
      }
    },
  };
}

/** The page's clock. */
export const captureClock: CaptureClock = createCaptureClock(
  typeof location === "undefined" ? "" : location.search,
  () => performance.now(),
);

if (captureClock.stepping && typeof window !== "undefined") {
  Object.assign(window, {
    __captureStep: (count: number) => captureClock.step(count),
  });
}

/** The one clock read on the match's input and capture path. */
export function now(): number {
  return captureClock.now();
}
