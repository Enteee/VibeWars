/**
 * How many messages each client may have handled, as a token bucket
 * (#43): `ratePerSecond` sustained, and up to `burst` at once.
 *
 * Over budget, a message is ignored rather than its sender dropped. A
 * burst is what an honest client sends after a network stall: everything
 * it queued arrives at once. Dropping it there left the player connected
 * but deaf, because Colyseus stops reading a client it drops and only
 * closes the socket once our `onLeave` (the whole reconnection window)
 * is over. Ignoring instead keeps the handlers' cost bounded for a
 * flooder and costs an honest player nothing it could still use.
 */
export class MessageBudget {
  readonly #ratePerSecond: number;
  readonly #burst: number;
  readonly #buckets = new Map<string, { tokens: number; at: number }>();

  public constructor(ratePerSecond: number, burst: number) {
    this.#ratePerSecond = ratePerSecond;
    this.#burst = burst;
  }

  /** Spend one message for `sessionId` at `nowMs`; false if it is over budget. */
  public take(sessionId: string, nowMs: number): boolean {
    const bucket = this.#buckets.get(sessionId) ?? { tokens: this.#burst, at: nowMs };
    bucket.tokens = Math.min(
      this.#burst,
      bucket.tokens + (Math.max(0, nowMs - bucket.at) / 1000) * this.#ratePerSecond,
    );
    bucket.at = nowMs;
    this.#buckets.set(sessionId, bucket);
    if (bucket.tokens < 1) {
      return false;
    }
    bucket.tokens -= 1;
    return true;
  }

  /** Stop tracking a client that is gone for good. */
  public forget(sessionId: string): void {
    this.#buckets.delete(sessionId);
  }
}
