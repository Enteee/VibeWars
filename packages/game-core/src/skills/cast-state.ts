/**
 * Per-combatant cast and recharge state (brief §13's skill-processing
 * stage, and the seam Sprint 14's interrupts plug into).
 *
 * Time is tracked in seconds and advanced by an explicit `dt` — never by
 * reading a clock — so the whole thing is deterministic and testable
 * without waiting in real time (brief §35).
 */

import type { StatusId, StatusSet } from "./status.js";
import type { Skill } from "./types.js";

export interface ActiveCast {
  readonly skillId: string;
  readonly targetId: string | undefined;
  /** The whole cast, dazed included: what the cast bar fills towards. */
  readonly totalSeconds: number;
  /** Seconds still remaining before the skill fires. */
  remainingSeconds: number;
  /** The status its caster bears until it ends (`Skill.whileActivating`). */
  readonly whileActivating: StatusId | undefined;
}

/**
 * How close to zero an aftercast may be and count as over: 0.75 s in
 * 0.05 s ticks leaves a float crumb that would otherwise cost a tick.
 */
const AFTERCAST_EPSILON = 1e-9;

/** A wait still running: seconds remaining, and the seconds it started with. */
type Wait = readonly [remaining: number, total: number];

export class CastState {
  readonly #ownerId: string;
  readonly #statuses: StatusSet;
  #activeCast: ActiveCast | undefined;
  /** Each skill's recharge, and apart from it its disable (#914): `[remaining, total]`. */
  readonly #recharge = new Map<string, Wait>();
  readonly #disabled = new Map<string, Wait>();
  /** The longer of the two, per skill: what the bar shows and readiness reads. */
  readonly #rechargeRemaining = new Map<string, number>();
  readonly #rechargeTotal = new Map<string, number>();
  /** Skills used and waiting for a morale boost (#474). */
  readonly #spent = new Set<string>();
  #aftercastRemaining = 0;
  #queuedSlot: number | undefined;

  /**
   * `statuses` are the caster's own: a cast puts its `whileActivating`
   * status on them as it begins, and takes it off as it ends (#524).
   */
  public constructor(ownerId: string, statuses: StatusSet) {
    this.#ownerId = ownerId;
    this.#statuses = statuses;
  }

  public get activeCast(): ActiveCast | undefined {
    return this.#activeCast;
  }

  /** Activating: what the cast bar shows. Not true during aftercast. */
  public get isCasting(): boolean {
    return this.#activeCast !== undefined;
  }

  /**
   * The aftercast (#317): after a skill with an activation time goes off,
   * a moment in which the caster neither moves, attacks, nor starts
   * another cast, as in GW1.
   */
  public get inAftercast(): boolean {
    return this.#aftercastRemaining > 0;
  }

  /** The slot to use when the aftercast ends, if one was pressed during it. */
  public get queuedSlot(): number | undefined {
    return this.#queuedSlot;
  }

  /**
   * How long each skill still waits: its recharge or its disable (#914),
   * whichever is longer, so a disabled skill looks like a recharging one.
   */
  public get rechargeRemaining(): ReadonlyMap<string, number> {
    return this.#rechargeRemaining;
  }

  /**
   * The duration each running wait started with, keyed like
   * `rechargeRemaining`: what a recharge display measures progress
   * against, so a modified recharge still draws a true wipe (#152).
   */
  public get rechargeTotal(): ReadonlyMap<string, number> {
    return this.#rechargeTotal;
  }

  /**
   * Begin casting. A `whileActivating` status lasts until the cast ends,
   * which is what takes it off; an instant has no activation to bear it in.
   */
  public beginCast(
    skillId: string,
    targetId: string | undefined,
    activationSeconds: number,
    whileActivating: StatusId | undefined,
  ): void {
    const bears = activationSeconds > 0 ? whileActivating : undefined;
    this.#activeCast = {
      skillId,
      targetId,
      totalSeconds: activationSeconds,
      remainingSeconds: activationSeconds,
      whileActivating: bears,
    };
    if (bears !== undefined) {
      this.#statuses.apply(bears, Number.POSITIVE_INFINITY, this.#ownerId);
    }
  }

  /** The cast is over, however it ended: its `whileActivating` status goes with it. */
  #endCast(): ActiveCast | undefined {
    const cast = this.#activeCast;
    this.#activeCast = undefined;
    if (cast?.whileActivating !== undefined) {
      this.#statuses.remove(cast.whileActivating);
    }
    return cast;
  }

  /**
   * Abort the in-progress cast without firing it (interrupts, death,
   * target loss). Returns what was cancelled, so a caller can log it or
   * apply interrupt consequences.
   */
  public cancelCast(): ActiveCast | undefined {
    return this.#endCast();
  }

  public beginAftercast(seconds: number): void {
    this.#aftercastRemaining = seconds;
  }

  /** End the aftercast now (death, reset), and with it anything queued. */
  public endAftercast(): void {
    this.#aftercastRemaining = 0;
    this.#queuedSlot = undefined;
  }

  /** Use `slot` once the aftercast ends; a later press replaces it. */
  public queue(slot: number): void {
    this.#queuedSlot = slot;
  }

  /** The queued slot, emptying the queue. */
  public takeQueued(): number | undefined {
    const slot = this.#queuedSlot;
    this.#queuedSlot = undefined;
    return slot;
  }

  public clearQueue(): void {
    this.#queuedSlot = undefined;
  }

  /**
   * Skills used and waiting for a morale boost rather than recharging
   * (#474): Resurrection Signet's. Apart from `rechargeRemaining`, which a
   * disable still fills.
   */
  public get spent(): ReadonlySet<string> {
    return this.#spent;
  }

  /** `skillId` is spent until a morale boost (#474). */
  public spend(skillId: string): void {
    this.#spent.add(skillId);
  }

  /** A morale boost (#474): every spent skill is ready. Whether any was spent. */
  public refreshSpent(): boolean {
    const any = this.#spent.size > 0;
    this.#spent.clear();
    return any;
  }

  /** Start `skillId`'s recharge; a disable it has runs on regardless (#914). */
  public startRecharge(skillId: string, rechargeSeconds: number): void {
    if (rechargeSeconds > 0) {
      this.#recharge.set(skillId, [rechargeSeconds, rechargeSeconds]);
      this.#show(skillId);
    }
  }

  /**
   * `skillId`'s recharge is over at once, as Moebius Strike makes it
   * (#885). A disable is not a recharge: it keeps the skill waiting (#914).
   */
  public endRecharge(skillId: string): void {
    this.#recharge.delete(skillId);
    this.#show(skillId);
  }

  /**
   * `skillId` takes `seconds` longer to recharge (#949): Diversion's. A
   * running recharge grows, start and end alike; none running becomes one
   * of `seconds`. It is recharge, so whatever ends a recharge ends it.
   */
  public lengthenRecharge(skillId: string, seconds: number): void {
    const [remaining, total] = this.#recharge.get(skillId) ?? [0, 0];
    this.#recharge.set(skillId, [remaining + seconds, total + seconds]);
    this.#show(skillId);
  }

  /**
   * Disable `skillId` for `seconds` (#914, GW1): the disable and the
   * recharge run together, apart, so the skill waits for the longer, and
   * nothing that ends a recharge ends a disable. A longer disable already
   * running stays. Returns whether the wait got longer: under a longer
   * recharge it did not, though the disable is kept, for when something
   * ends that recharge early.
   */
  public disable(skillId: string, seconds: number): boolean {
    const waiting = this.#rechargeRemaining.get(skillId) ?? 0;
    if (seconds > (this.#disabled.get(skillId)?.[0] ?? 0)) {
      this.#disabled.set(skillId, [seconds, seconds]);
      this.#show(skillId);
    }
    return seconds > waiting;
  }

  /** Put the longer of `skillId`'s recharge and disable where readers look. */
  #show(skillId: string): void {
    const recharge = this.#recharge.get(skillId);
    const disabled = this.#disabled.get(skillId);
    const longer =
      recharge === undefined || (disabled !== undefined && disabled[0] > recharge[0])
        ? disabled
        : recharge;
    if (longer === undefined) {
      this.#rechargeRemaining.delete(skillId);
      this.#rechargeTotal.delete(skillId);
    } else {
      this.#rechargeRemaining.set(skillId, longer[0]);
      this.#rechargeTotal.set(skillId, longer[1]);
    }
  }

  /**
   * Advance time by `dt` seconds. Returns the cast that completed on this
   * tick, if any — the caller is responsible for actually applying its
   * effects, because only the caller knows whether the target is still
   * valid by the time the cast lands. An aftercast the caller begins on
   * resolving it counts down from the next call.
   */
  public advance(dt: number): ActiveCast | undefined {
    for (const waits of [this.#recharge, this.#disabled]) {
      for (const [skillId, [remaining, total]] of waits) {
        const next = remaining - dt;
        if (next <= 0) {
          waits.delete(skillId);
        } else {
          waits.set(skillId, [next, total]);
        }
      }
    }
    for (const skillId of [...this.#rechargeRemaining.keys()]) {
      this.#show(skillId);
    }

    if (this.#aftercastRemaining > 0) {
      this.#aftercastRemaining -= dt;
      if (this.#aftercastRemaining <= AFTERCAST_EPSILON) {
        this.#aftercastRemaining = 0;
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

    return this.#endCast();
  }
}

/**
 * Start `skill`'s recharge as it is used, interrupted or knocked out of
 * its cast: by time, or spent until a morale boost (#474). The one call
 * every such path makes.
 */
export function beginRecharge(cast: CastState, skill: Skill, seconds: number): void {
  if (skill.rechargesOnMoraleBoost === true) {
    cast.spend(skill.id);
  } else {
    cast.startRecharge(skill.id, seconds);
  }
}
