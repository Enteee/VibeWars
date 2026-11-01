/**
 * Per-combatant cast and recharge state (brief §13's skill-processing
 * stage, and the seam Sprint 14's interrupts plug into).
 *
 * Time is tracked in seconds and advanced by an explicit `dt` — never by
 * reading a clock — so the whole thing is deterministic and testable
 * without waiting in real time (brief §35).
 */

import type { SkillBar } from "../build.js";
import {
  NO_OWN_SKILL_BOOST,
  NO_RANKS,
  type AttributeDelta,
  type OwnSkillBoost,
  type StatusId,
  type StatusSet,
} from "./status.js";
import type { Skill } from "./types.js";

/**
 * What chants' next-skill rules give the cast that consumed them (#1505):
 * Song of Concentration's, Anthem of Guidance's.
 */
export interface CastRule {
  /** No interrupt cancels it; a knockdown still does. */
  readonly uninterruptible: boolean;
  /** Its blows, if it is an attack skill, cannot be blocked. */
  readonly unblockable: boolean;
  /** It recharges at once as it ends (#1730): Glyph of Renewal's. */
  readonly rechargesInstantly: boolean;
  /** Seconds on its recharge as it ends (#1730): Glyph of Sacrifice's. */
  readonly extraRechargeSeconds: number;
  /** How much faster it recharges as it ends (#1941): Ritual Lord's binding ritual, 0.5. */
  readonly rechargeFaster: number;
  /** Skills whose recharge ends as it ends (#1941): Ritual Lord's own. */
  readonly resetsRecharge: readonly string[];
  /**
   * The attribute deltas of the statuses its start spent (#1941), held
   * while it resolves: the last of Glyph of Elemental Power's spells, or
   * Ritual Lord's skill, still scales with the boost.
   */
  readonly heldAttributeDeltas: readonly AttributeDelta[];
  /**
   * What its caster's statuses do to skills of its kind (#1761), taken as
   * it was paid for: a status spent on it, or one that ends during the
   * cast, still lengthens what it puts on and lessens what it heals.
   */
  readonly own: OwnSkillBoost;
}

/** A cast no chant's or glyph's rule touched. */
export const NO_CAST_RULE: CastRule = {
  uninterruptible: false,
  unblockable: false,
  rechargesInstantly: false,
  extraRechargeSeconds: 0,
  rechargeFaster: 0,
  resetsRecharge: [],
  heldAttributeDeltas: [],
  own: NO_OWN_SKILL_BOOST,
};

export interface ActiveCast {
  readonly skillId: string;
  /** What it recharges under (#469): `SlotSkill.key`. */
  readonly key: string;
  readonly targetId: string | undefined;
  /** The whole cast, dazed included: what the cast bar fills towards. */
  readonly totalSeconds: number;
  /** Seconds still remaining before the skill fires. */
  remainingSeconds: number;
  /** The status its caster bears until it ends (`Skill.whileActivating`). */
  readonly whileActivating: StatusId | undefined;
  /** What it carries from its caster's chants (#1505). */
  readonly rule: CastRule;
}

/**
 * How close to zero an aftercast may be and count as over: 0.75 s in
 * 0.05 s ticks leaves a float crumb that would otherwise cost a tick.
 */
const AFTERCAST_EPSILON = 1e-9;

/** A wait still running: seconds remaining, and the seconds it started with. */
type Wait = readonly [remaining: number, total: number];

/**
 * A copy of a skill standing in a slot for a while (#469): Arcane Echo's
 * and Echo's. It waits apart from the original, under its own key.
 */
export interface SlotOverride {
  readonly skillId: string;
  /** Wait key for recharge, disable, spent and adrenaline: `copyKey`. */
  readonly key: string;
  remainingSeconds: number;
  /** The build skill's id and recharge, started when the copy ends. */
  readonly restores: { readonly skillId: string; readonly rechargeSeconds: number };
}

/** The skill a slot holds now, and the key it waits under. */
export interface SlotSkill {
  readonly skillId: string;
  readonly key: string;
}

/** The key a copy of `skillId` in `slot` waits under (#469). */
export function copyKey(skillId: string, slot: number): string {
  return `${skillId}@${String(slot)}`;
}

/** The skill a wait key is for: a build slot's key is its skill id. */
export function skillIdOfKey(key: string): string {
  const at = key.indexOf("@");
  return at === -1 ? key : key.slice(0, at);
}

/** Whether `key` is a copy's rather than a build slot's. */
export function isCopyKey(key: string): boolean {
  return key.includes("@");
}

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
  /** Copies standing in slots (#469), by slot. */
  readonly #overrides = new Map<number, SlotOverride>();
  /** The cast `cancelCast` last ended: what a disable after an interrupt reads. */
  #cancelled: ActiveCast | undefined;

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

  /** The slot to use when the cast and aftercast end, if one was pressed during them (#1722). */
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
   * `rule` is what the chants it consumed give it (#1505).
   */
  public beginCast(
    skillId: string,
    targetId: string | undefined,
    activationSeconds: number,
    whileActivating: StatusId | undefined,
    key: string = skillId,
    rule: CastRule = NO_CAST_RULE,
  ): void {
    const bears = activationSeconds > 0 ? whileActivating : undefined;
    this.#activeCast = {
      skillId,
      key,
      targetId,
      totalSeconds: activationSeconds,
      remainingSeconds: activationSeconds,
      whileActivating: bears,
      rule,
    };
    if (bears !== undefined) {
      // No `whileActivating` status scales (#1976).
      this.#statuses.apply(bears, Number.POSITIVE_INFINITY, this.#ownerId, NO_RANKS);
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
    this.#cancelled = this.#endCast();
    return this.#cancelled;
  }

  /**
   * The cast `cancelCast` last ended, if any: which key an interrupt just
   * hit, for a disable that follows it in the same resolution (#914, #469).
   */
  public get lastCancelled(): ActiveCast | undefined {
    return this.#cancelled;
  }

  /** The copies standing in slots now (#469), by slot. */
  public get overrides(): ReadonlyMap<number, SlotOverride> {
    return this.#overrides;
  }

  /**
   * `slot` holds a copy (#469). One already there ends at once, its waits
   * with it, and restores nothing: the new copy stands in for it.
   */
  public override(slot: number, copy: SlotOverride): void {
    const replaced = this.#overrides.get(slot);
    if (replaced !== undefined) {
      this.#forget(replaced.key);
    }
    this.#overrides.set(slot, copy);
  }

  /** Every copy is gone, restoring nothing: death, respawn and reset (#469). */
  public clearOverrides(): void {
    for (const copy of this.#overrides.values()) {
      this.#forget(copy.key);
    }
    this.#overrides.clear();
  }

  /** Whether `key` still names a slot: a build skill's always, a copy's while it stands. */
  #holds(key: string): boolean {
    return !isCopyKey(key) || [...this.#overrides.values()].some((copy) => copy.key === key);
  }

  /** A copy's waits go with it. */
  #forget(key: string): void {
    this.#recharge.delete(key);
    this.#disabled.delete(key);
    this.#spent.delete(key);
    this.#show(key);
  }

  public beginAftercast(seconds: number): void {
    this.#aftercastRemaining = seconds;
  }

  /** End the aftercast now (death, reset), and with it anything queued. */
  public endAftercast(): void {
    this.#aftercastRemaining = 0;
    this.#queuedSlot = undefined;
  }

  /** Use `slot` once the cast and aftercast end; a later press replaces it. */
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
    if (this.#holds(skillId)) {
      this.#spent.add(skillId);
    }
  }

  /** A morale boost (#474): every spent skill is ready. Whether any was spent. */
  public refreshSpent(): boolean {
    const any = this.#spent.size > 0;
    this.#spent.clear();
    return any;
  }

  /** Start `skillId`'s recharge; a disable it has runs on regardless (#914). */
  public startRecharge(skillId: string, rechargeSeconds: number): void {
    // A copy that ended mid-cast has nothing left to recharge (#469).
    if (rechargeSeconds > 0 && this.#holds(skillId)) {
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
    if (!this.#holds(skillId)) {
      return;
    }
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
    if (!this.#holds(skillId)) {
      return false;
    }
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
    // A copy that ends gives its slot back, and the echo skill there
    // starts its own recharge (#469).
    for (const [slot, copy] of [...this.#overrides]) {
      copy.remainingSeconds -= dt;
      if (copy.remainingSeconds <= 0) {
        this.#overrides.delete(slot);
        this.#forget(copy.key);
        this.startRecharge(copy.restores.skillId, copy.restores.rechargeSeconds);
      }
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
export function beginRecharge(
  cast: CastState,
  skill: Skill,
  seconds: number,
  key: string = skill.id,
): void {
  if (skill.rechargesOnMoraleBoost === true) {
    cast.spend(key);
  } else {
    cast.startRecharge(key, seconds);
  }
}

/**
 * The skill in `slot` now (#469): a copy standing there, or the build's.
 * The one resolver: activation, recharge, disable, adrenaline, the bar
 * sent to its owner and the AI all ask it. The build is never touched.
 */
export function slotSkill(
  bar: SkillBar,
  cast: Pick<CastState, "overrides">,
  slot: number,
): SlotSkill | undefined {
  const copy = cast.overrides.get(slot);
  if (copy !== undefined) {
    return { skillId: copy.skillId, key: copy.key };
  }
  const skillId = bar[slot];
  return skillId === undefined || skillId === null ? undefined : { skillId, key: skillId };
}

/** Every slot of `bar` as `slotSkill` resolves it, `null` for an empty one. */
export function resolvedBar(
  bar: SkillBar,
  cast: Pick<CastState, "overrides">,
): readonly (SlotSkill | null)[] {
  return bar.map((_, slot) => slotSkill(bar, cast, slot) ?? null);
}
