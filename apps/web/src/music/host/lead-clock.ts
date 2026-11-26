/**
 * The scheduler's clock, kept ahead of the audio clock (#446, #448).
 *
 * Strudel's cyclist queries slots up to 0.2 s past the clock it is given,
 * and skips every slot already behind it. A tick the busy main thread
 * delivers late finds the clock jumped on, and its slots skipped: a dropout.
 * Shifting the clock by a constant would shift the lookahead with it and
 * change nothing. This one runs `lead` ahead of the audio clock, but moves
 * on at most `maxStep` per reading, the cyclist's own lookahead, so a late
 * tick resumes where the last one stopped, with nothing skipped. The notes
 * it queried `lead` ahead are already in Web Audio and keep playing. The gap
 * to `lead` is closed by `tick`, which runs the cyclist's tick again until the
 * clock has caught up: one tick only ever covers `maxStep` of music, so a
 * main thread that delivers ticks 0.3 s apart would otherwise run dry.
 *
 * The time a note is queried at is the time it plays at in the audio
 * context: nothing is delayed or sped up, only queried earlier.
 *
 * It never falls behind the audio clock itself (#1321): a main thread that
 * stalls for longer than the lead would otherwise leave every later tick
 * querying music that has already played, a note at a time, and the music
 * never back to live. After such a stall it starts again `lead` ahead of
 * the audio clock, in one tick, and the music it jumped is skipped (#1991):
 * caught up a tick at a time, every note in the first ticks would be due
 * at once or already past, a burst of truncated attacks that crackles.
 */
export interface LeadClock {
  /** The time the scheduler works at now. */
  (): number;
  /** How far the clock is behind `lead` ahead of the audio clock, in seconds. */
  deficit(): number;
  /** Whether the audio clock has passed the clock's last reading: a stall longer than `lead`. */
  behind(): boolean;
  /** Forget the clock: the next reading is `lead` ahead of the audio clock again. */
  reset(): void;
}

export function leadClock(audioTime: () => number, lead: number, maxStep: number): LeadClock {
  let last: number | undefined;
  const read = (): number => {
    const now = audioTime();
    const target = now + lead;
    last = last === undefined ? target : Math.max(last, now, Math.min(target, last + maxStep));
    return last;
  };
  read.deficit = (): number => (last === undefined ? 0 : Math.max(0, audioTime() + lead - last));
  read.behind = (): boolean => last !== undefined && last < audioTime();
  read.reset = (): void => {
    last = undefined;
  };
  return read;
}

/** The most ticks one timer firing runs to catch up. */
const MAX_CATCH_UP_TICKS = 4;

/**
 * One firing of the scheduler's timer: the cyclist's tick, and again while
 * the clock is still more than a quarter of its step behind, so that a late
 * timer finds the music queried as far ahead as an on-time one would have.
 * A clock the audio has passed is reset instead, and ticks once.
 */
export function catchUpTick(clock: LeadClock, maxStep: number, callback: () => void): void {
  if (clock.behind()) {
    clock.reset();
    callback();
    return;
  }
  callback();
  for (let again = 1; again < MAX_CATCH_UP_TICKS && clock.deficit() > maxStep / 4; again += 1) {
    callback();
  }
}
