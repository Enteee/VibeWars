/**
 * How long from now a track's first beat is placed (#2936), in seconds: at
 * `startAtEpochMs`, unless that leaves the scheduler too little notice.
 */
export function firstBeatDelay(options: {
  readonly startAtEpochMs: number;
  readonly nowEpochMs: number;
  readonly leadSeconds: number;
  readonly marginSeconds: number;
}): number {
  const { startAtEpochMs, nowEpochMs, leadSeconds, marginSeconds } = options;
  return Math.max((startAtEpochMs - nowEpochMs) / 1000, leadSeconds + marginSeconds);
}
