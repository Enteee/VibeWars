/**
 * Per-combatant cast and recharge state (brief §13's skill-processing
 * stage, and the seam Sprint 14's interrupts plug into).
 *
 * Time is tracked in seconds and advanced by an explicit `dt` — never by
 * reading a clock — so the whole thing is deterministic and testable
 * without waiting in real time (brief §35).
 */

export interface ActiveCast {
  readonly skillId: string;
  readonly targetId: string | undefined;
  /** The whole cast, dazed included: what the cast bar fills towards. */
  readonly totalSeconds: number;
  /** Seconds still remaining before the skill fires. */
  remainingSeconds: number;
}

export class CastState {
  #activeCast: ActiveCast | undefined;
  readonly #rechargeRemaining = new Map<string, number>();
  readonly #rechargeTotal = new Map<string, number>();

  public get activeCast(): ActiveCast | undefined {
    return this.#activeCast;
  }

  public get isCasting(): boolean {
    return this.#activeCast !== undefined;
  }

  public get rechargeRemaining(): ReadonlyMap<string, number> {
    return this.#rechargeRemaining;
  }

  /**
   * The duration each running recharge started with, keyed like
   * `rechargeRemaining`: what a recharge display measures progress
   * against, so a modified recharge still draws a true wipe (#152).
   */
  public get rechargeTotal(): ReadonlyMap<string, number> {
    return this.#rechargeTotal;
  }

  public beginCast(skillId: string, targetId: string | undefined, activationSeconds: number): void {
    this.#activeCast = {
      skillId,
      targetId,
      totalSeconds: activationSeconds,
      remainingSeconds: activationSeconds,
    };
  }

  /**
   * Abort the in-progress cast without firing it (interrupts, death,
   * target loss). Returns what was cancelled, so a caller can log it or
   * apply interrupt consequences.
   */
  public cancelCast(): ActiveCast | undefined {
    const cancelled = this.#activeCast;
    this.#activeCast = undefined;
    return cancelled;
  }

  public startRecharge(skillId: string, rechargeSeconds: number): void {
    if (rechargeSeconds > 0) {
      this.#rechargeRemaining.set(skillId, rechargeSeconds);
      this.#rechargeTotal.set(skillId, rechargeSeconds);
    }
  }

  /**
   * Advance time by `dt` seconds. Returns the cast that completed on this
   * tick, if any — the caller is responsible for actually applying its
   * effects, because only the caller knows whether the target is still
   * valid by the time the cast lands.
   */
  public advance(dt: number): ActiveCast | undefined {
    for (const [skillId, remaining] of this.#rechargeRemaining) {
      const next = remaining - dt;
      if (next <= 0) {
        this.#rechargeRemaining.delete(skillId);
        this.#rechargeTotal.delete(skillId);
      } else {
        this.#rechargeRemaining.set(skillId, next);
      }
    }

    const cast = this.#activeCast;
    if (cast === undefined) {
      return undefined;
    }

    cast.remainingSeconds -= dt;
    if (cast.remainingSeconds > 0) {
      return undefined;
    }

    this.#activeCast = undefined;
    return cast;
  }
}
