import type { MusicLevel } from "../host-protocol.js";

/**
 * What the render-ahead player renders next (#509, spike). A track is cut
 * into chunks of `chunkCycles` cycles; chunk `k` holds the events whose
 * onset is in cycles `[k * chunkCycles, (k + 1) * chunkCycles)` of the
 * track, plus their tails. One chunk is one whole mix at one level, since
 * a track reads `INTENSITY` inside its controls and stems per layer would
 * be wrong.
 */
export interface RenderPlan {
  readonly chunkCycles: number;
  /** Chunks of the wanted level kept rendered ahead, the one playing included. */
  readonly aheadChunks: number;
  /** Of those, how many also have the levels either side rendered. */
  readonly neighbourChunks: number;
}

export interface RenderJob {
  readonly chunk: number;
  readonly level: MusicLevel;
}

/** The chunk a track cycle falls in. */
export function chunkOf(cycle: number, chunkCycles: number): number {
  return Math.floor(cycle / chunkCycles);
}

/** The key a rendered chunk is kept under. */
export function jobKey(job: RenderJob): string {
  return `${String(job.chunk)}:${String(job.level)}`;
}

function neighbours(level: MusicLevel): MusicLevel[] {
  const either: number[] = [level - 1, level + 1];
  return either.filter((n): n is MusicLevel => n === 0 || n === 1 || n === 2 || n === 3);
}

/**
 * The next chunk to render, or `undefined` when everything wanted is.
 * The wanted level comes first, the chunk playing first among those, so a
 * level that is not ready is heard as soon as one render allows; then the
 * levels either side, nearest chunk first, so a step of one is a gain
 * change and nothing more.
 */
export function nextRender(
  plan: RenderPlan,
  playhead: number,
  level: MusicLevel,
  rendered: ReadonlySet<string>,
): RenderJob | undefined {
  const first = chunkOf(Math.max(0, playhead), plan.chunkCycles);
  const wanted: RenderJob[] = [];
  for (let chunk = first; chunk < first + plan.aheadChunks; chunk += 1) {
    wanted.push({ chunk, level });
  }
  for (let chunk = first; chunk < first + plan.neighbourChunks; chunk += 1) {
    for (const near of neighbours(level)) {
      wanted.push({ chunk, level: near });
    }
  }
  return wanted.find((job) => !rendered.has(jobKey(job)));
}

/**
 * Whether a rendered chunk can go: its slot and its tail are both behind
 * the playhead.
 */
export function stale(
  plan: RenderPlan,
  job: RenderJob,
  playhead: number,
  tailCycles: number,
): boolean {
  return (job.chunk + 1) * plan.chunkCycles + tailCycles <= playhead;
}
