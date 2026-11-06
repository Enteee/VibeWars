/**
 * Where a sting starts (#2523), in cycles: on the first quarter cycle, a
 * beat, at or after `position`, the end of what the scheduler has queried.
 * A track still to land at `landsAt` (a switch planned) holds it until
 * then, so the sting plays over the new track, in its key.
 */
export function stingStart(position: number, landsAt?: number): number {
  const beat = Math.ceil(position * 4) / 4;
  return landsAt === undefined ? beat : Math.max(beat, landsAt);
}
