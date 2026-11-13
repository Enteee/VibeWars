/**
 * `?frametiming` (#3240): what a match frame costs and how often a new
 * snapshot reaches it, for `scripts/bench/render-bench.mjs --follow`.
 * Without the flag nothing is measured. The bench reads
 * `window.__frameTiming`, then resets it to measure a window of its own.
 */

/** Times in ms, appended as they happen. */
export interface FrameTiming {
  /** Per frame: the game's step, the match view's frame and `ArenaScene.update`. */
  readonly update: number[];
  /** Per frame: Phaser's render of the scene. */
  readonly render: number[];
  /** Between two frames that each drew a new snapshot, by its match clock. */
  readonly snapshots: number[];
}

/** Whether the page asked to measure its frames: `?frametiming`. */
export function measuringFrames(search: string): boolean {
  return new URLSearchParams(search).has("frametiming");
}

/** The page's stats, on `window.__frameTiming`, or `undefined` without `?frametiming`. */
export function frameTiming(): FrameTiming | undefined {
  if (!measuringFrames(location.search)) {
    return undefined;
  }
  const shown: unknown = Reflect.get(window, "__frameTiming");
  if (isFrameTiming(shown)) {
    return shown;
  }
  const stats: FrameTiming = { update: [], render: [], snapshots: [] };
  Object.assign(window, { __frameTiming: stats });
  return stats;
}

function isFrameTiming(value: unknown): value is FrameTiming {
  return (
    typeof value === "object" &&
    value !== null &&
    "update" in value &&
    Array.isArray(value.update) &&
    "render" in value &&
    Array.isArray(value.render) &&
    "snapshots" in value &&
    Array.isArray(value.snapshots)
  );
}

/**
 * Counts the snapshots a frame loop draws: call it once per frame with the
 * drawn snapshot's match clock, which a new snapshot moves, and it records
 * the time since the last new one.
 */
export function snapshotCadence(
  stats: FrameTiming,
  now: () => number,
): (elapsedSeconds: number) => void {
  let last: number | undefined;
  let at = 0;
  return (elapsedSeconds) => {
    if (elapsedSeconds === last) {
      return;
    }
    const time = now();
    if (last !== undefined) {
      stats.snapshots.push(time - at);
    }
    last = elapsedSeconds;
    at = time;
  };
}
