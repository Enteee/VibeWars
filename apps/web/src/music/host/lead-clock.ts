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
 */
export interface LeadClock {
  /** The time the scheduler works at now. */
  (): number;
  /** How far the clock is behind `lead` ahead of the audio clock, in seconds. */
  deficit(): number;
  /** Forget the clock: the next reading is `lead` ahead of the audio clock again. */
  reset(): void;
}

export function leadClock(audioTime: () => number, lead: number, maxStep: number): LeadClock {
  let last: number | undefined;
  const read = (): number => {
    const target = audioTime() + lead;
    last = last === undefined ? target : Math.max(last, Math.min(target, last + maxStep));
    return last;
  };
  read.deficit = (): number => (last === undefined ? 0 : Math.max(0, audioTime() + lead - last));
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
 */
export function catchUpTick(clock: LeadClock, maxStep: number, callback: () => void): void {
  callback();
  for (let again = 1; again < MAX_CATCH_UP_TICKS && clock.deficit() > maxStep / 4; again += 1) {
    callback();
  }
}
