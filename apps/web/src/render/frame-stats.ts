/**
 * `?framestats` (#3240): what a match frame costs and how often a new
 * snapshot reaches it, for `scripts/bench/render-bench.mjs --follow`.
 * Without the flag nothing is measured. The bench reads
 * `window.__frameStats`, then resets it to measure a window of its own.
 */

/** Times in ms, appended as they happen. */
export interface FrameStats {
  /** Per frame: the game's step, the match view's frame and `ArenaScene.update`. */
  readonly update: number[];
  /** Per frame: Phaser's render of the scene. */
  readonly render: number[];
  /** Between two frames that each drew a new snapshot, by its match clock. */
  readonly snapshots: number[];
}

/** Whether the page asked to measure its frames: `?framestats`. */
export function measuringFrames(search: string): boolean {
  return new URLSearchParams(search).has("framestats");
}

/** The page's stats, on `window.__frameStats`, or `undefined` without `?framestats`. */
export function frameStats(): FrameStats | undefined {
  if (!measuringFrames(location.search)) {
    return undefined;
  }
  const shown: unknown = Reflect.get(window, "__frameStats");
  if (isFrameStats(shown)) {
    return shown;
  }
  const stats: FrameStats = { update: [], render: [], snapshots: [] };
  Object.assign(window, { __frameStats: stats });
  return stats;
}

function isFrameStats(value: unknown): value is FrameStats {
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
  stats: FrameStats,
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
