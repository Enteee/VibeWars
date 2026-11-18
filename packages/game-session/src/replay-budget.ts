import { MAX_REPLAY_CHARS, type ReplayInput } from "./replay.js";

/**
 * What a match's replay keeps for itself (#3572): its header, the bots'
 * seats and the host's own inputs, which no player pays for.
 */
export const REPLAY_RESERVE_CHARS = 64 * 1024;

/**
 * How much of its share a player may spend at once, in characters: about
 * 300 moves, more than a long frantic fight sends.
 */
export const REPLAY_BURST_CHARS = 32_000;

/** The latest tick a match reaches: over five days at 20 a second. */
const LATEST_TICK = 9_999_999;

/** What `input` adds to a replay's encoding: itself, and a comma. */
export function inputChars(input: ReplayInput): number {
  return JSON.stringify(input).length + 1;
}

/** The most an input of `kind` naming `id` adds, at any tick. */
export function latestInputChars(kind: "remove" | "drop", id: string): number {
  return inputChars([LATEST_TICK, kind, id]);
}

/** The most a `called` input adds: a 64-character target, at any tick. */
export const CALLED_CHARS = inputChars([LATEST_TICK, "called", 2, "x".repeat(64)]);

/** The most a `forfeit` input adds. */
export const FORFEIT_CHARS = inputChars([LATEST_TICK, "forfeit", 2, [0, 1, 2]]);

/**
 * What each player may put in a match's replay (#3572), in characters of
 * its encoding: a token bucket per slot, refilled by match time and never
 * past the time limit. A slot gets at most its share over a whole match,
 * so the slots' inputs and the reserve fit `MAX_REPLAY_CHARS` whatever
 * they send, and a player who floods the host cannot make it keep no
 * replay. What a player cannot pay for is ignored before the simulation
 * hears it, so the replay and the match never disagree.
 *
 * A slot is a lobby's seat, its peer: a rejoin or a second join is the
 * same slot, with what is left of its share.
 */
export class ReplayBudget {
  readonly #burst: number;
  readonly #ratePerSecond: number;
  readonly #timeLimitSeconds: number;
  readonly #buckets = new Map<string, { tokens: number; at: number }>();

  public constructor(slots: number, timeLimitSeconds: number) {
    const share = Math.floor((MAX_REPLAY_CHARS - REPLAY_RESERVE_CHARS) / Math.max(1, slots));
    this.#burst = Math.min(REPLAY_BURST_CHARS, Math.floor(share / 2));
    this.#ratePerSecond = (share - this.#burst) / timeLimitSeconds;
    this.#timeLimitSeconds = timeLimitSeconds;
  }

  /** Spend `chars` of `slot`'s share at `elapsedSeconds`; false, and nothing spent, if it has not got them. */
  public take(slot: string, chars: number, elapsedSeconds: number): boolean {
    const at = Math.min(elapsedSeconds, this.#timeLimitSeconds);
    const bucket = this.#buckets.get(slot) ?? { tokens: this.#burst, at: 0 };
    bucket.tokens = Math.min(
      this.#burst,
      bucket.tokens + Math.max(0, at - bucket.at) * this.#ratePerSecond,
    );
    bucket.at = Math.max(bucket.at, at);
    this.#buckets.set(slot, bucket);
    if (bucket.tokens < chars) {
      return false;
    }
    bucket.tokens -= chars;
    return true;
  }
}
