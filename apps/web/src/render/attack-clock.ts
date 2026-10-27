import { getSkill, type WeaponId } from "@vibewars/game-core";

import {
  REST_CLIP,
  WEAPON_MOTION,
  type AttackClip,
  type SwingClip,
  type WeaponMotion,
} from "./weapon-pose.js";

/**
 * One actor's attack, as the weapon mark plays it (#536, #560): a function
 * of the host's swing timer, on the match clock. Each snapshot says how far
 * into its swing the actor is and how long that swing is (`swingElapsed`,
 * `swingTotal`, 0 when not attacking); the hit lands at its end. Nothing
 * is predicted.
 *
 * - The wind-up starts `windUp + strike` before the end, so the strike
 *   ends on the hit. The first swing of an attack winds up like any other.
 * - Between snapshots the swing runs on with the match clock, up to its
 *   end, and never steps back: a swing the host paused (a cast, a walk
 *   into reach) holds its pose until the host runs it on.
 * - The elapsed time falling back ends the swing: a hit, when the host's
 *   timer could have run out since the last snapshot, and hold and recover
 *   play from it; otherwise a reset (a switch of target, a skill used),
 *   which eases from wherever the swing was back to rest over the recover
 *   time, as an attack that stops does. Never a snap.
 * - A swing the host says struck twice (#561) stabs with the off hand too,
 *   `OFF_HAND_DELAY` after the main hand, and counts as two hits, so the
 *   next swing is the main hand's again. The word comes with the hit, so
 *   the off hand's wind-up and strike fit inside the delay.
 * - An attack skill (#562) winds up over its whole activation, on the
 *   host's cast timer: rest at the cast's start, the strike's start at its
 *   end. While it winds up it replaces whatever the swing showed. A cast
 *   that runs out is a hit: strike, hold and recover play from its end.
 *   One that stops short (an interrupt, a cancel) eases back to rest over
 *   the recover time. The swing timer drives the pose again afterwards.
 *
 * No Phaser here, so it is tested in Node.
 */

/** The host's cast timer while an attack skill winds up (#562). */
export interface AttackCast {
  readonly elapsed: number;
  readonly total: number;
}

/**
 * The cast timer of the skill an actor is casting, if it is an attack
 * skill (#562); `undefined` for a spell, or no cast at all.
 */
export function attackCastOf(
  castingSkillId: string | undefined,
  castRemaining: number,
  castTotal: number,
): AttackCast | undefined {
  if (
    castingSkillId === undefined ||
    castTotal <= 0 ||
    getSkill(castingSkillId)?.attack === undefined
  ) {
    return undefined;
  }
  return { elapsed: Math.max(0, castTotal - castRemaining), total: castTotal };
}

/** The wire rounds the swing timer to the millisecond (`match-host.ts`): less is noise. */
const WIRE_EPSILON = 0.002;

/** How far behind the main hand the off hand stabs in a double strike (#561). */
export const OFF_HAND_DELAY = 0.09;

/**
 * A clip, and which hit it belongs to, so two-handed weapons alternate
 * hands; `offHand` is the other hand's clip while it plays a double
 * strike's second stab.
 */
export interface AttackFrame {
  readonly clip: AttackClip;
  readonly hit: number;
  readonly offHand?: AttackClip;
}

export const REST_FRAME: AttackFrame = { clip: REST_CLIP, hit: 0 };

/** A wind-up or a strike, and the hit it leads to. */
interface SwingFrame extends AttackFrame {
  readonly clip: SwingClip;
}

const unit = (t: number): number => Math.max(0, Math.min(1, t));

/**
 * The off hand's clip `sinceHit` seconds after a double strike's main
 * hit: wind-up and strike squeezed into `OFF_HAND_DELAY`, so it lands
 * that long after, then the weapon's own hold and recover. `undefined`
 * once it is back at rest.
 */
function offHandClip(m: WeaponMotion, sinceHit: number): AttackClip | undefined {
  if (sinceHit < 0) {
    return undefined;
  }
  if (sinceHit < OFF_HAND_DELAY) {
    const strike = Math.min(m.strike, OFF_HAND_DELAY);
    const windUp = OFF_HAND_DELAY - strike;
    return sinceHit < windUp
      ? { phase: "wind-up", progress: unit(sinceHit / windUp) }
      : { phase: "strike", progress: unit((sinceHit - windUp) / strike) };
  }
  const since = sinceHit - OFF_HAND_DELAY;
  if (since < m.hold) {
    return { phase: "hold", progress: unit(since / m.hold), sinceHit: since };
  }
  if (since < m.hold + m.recover) {
    return { phase: "recover", progress: unit((since - m.hold) / m.recover), sinceHit: since };
  }
  return undefined;
}

export class AttackClock {
  /** The swing under way: when it started on the match clock, and its length. */
  #swing: { readonly start: number; readonly total: number } | undefined;
  /** The last snapshot's reading of it. */
  #observed: { readonly at: number; readonly elapsed: number } | undefined;
  /** How far into the swing the mark has been shown, which it never goes back from. */
  #shown = 0;
  /** Hits so far; a double strike counts two, one a hand. */
  #hits = 0;
  /** When the last hit landed; `undefined` before the first. */
  #lastHit: number | undefined;
  /** When the last double strike's main hand hit; `undefined` before the first. */
  #lastDouble: number | undefined;
  /** The host said the swing under way struck twice before its hit was seen here. */
  #pendingDouble = false;
  /** A swing that stopped short, easing back to rest from where it was. */
  #settle: { readonly at: number; readonly from: SwingClip; readonly hit: number } | undefined;
  /** An attack skill winding up: when its cast started on the match clock, and its length. */
  #cast: { readonly start: number; readonly total: number } | undefined;
  /** The last snapshot's reading of the cast. */
  #castObserved: { readonly at: number; readonly elapsed: number } | undefined;
  /** How far into the cast the mark has been shown, which it never goes back from. */
  #castShown = 0;
  /** When the last attack skill's cast ran out: its strike plays from there. */
  #castStrike: number | undefined;

  /**
   * A snapshot taken at match time `at` says the actor is `elapsed` into a
   * swing of `total` seconds, `total` 0 when it does not attack, and how
   * far into its `cast` when an attack skill winds up. The same snapshot
   * seen again is ignored.
   */
  public observe(
    at: number,
    elapsed: number,
    total: number,
    weaponId: WeaponId,
    cast?: AttackCast,
  ): void {
    const last = this.#observed;
    if (last?.at === at) {
      return;
    }
    this.#observeSwing(at, elapsed, total, weaponId, last);
    this.#observeCast(at, cast, weaponId);
  }

  #observeSwing(
    at: number,
    elapsed: number,
    total: number,
    weaponId: WeaponId,
    last: { readonly at: number; readonly elapsed: number } | undefined,
  ): void {
    this.#observed = total > 0 ? { at, elapsed } : undefined;
    const swing = this.#swing;
    if (swing === undefined || last === undefined) {
      this.#begin(at, elapsed, total);
      return;
    }
    if (total > 0 && elapsed >= last.elapsed - WIRE_EPSILON) {
      // The same swing, run on or paused; an attack-speed change only
      // stretches it.
      this.#swing = { start: at - elapsed, total };
      return;
    }
    if (last.elapsed + (at - last.at) >= swing.total - WIRE_EPSILON) {
      this.#hits += 1;
      this.#lastHit = swing.start + swing.total;
      this.#settle = undefined;
      if (this.#pendingDouble) {
        this.#markDouble();
      }
    } else {
      const shown = this.#swingFrame(at, weaponId);
      if (shown !== undefined) {
        this.#settle = { at, from: shown.clip, hit: shown.hit };
      }
    }
    this.#pendingDouble = false;
    this.#begin(at, elapsed, total);
  }

  /**
   * The host says a swing struck twice (#561), at about match time `at`:
   * the hit just seen, or the one about to land, whichever is nearer.
   * The combat message and the snapshot of the same tick come in either
   * order; a swing lasts far longer than a tick, so nearer is never wrong.
   */
  public struckTwice(at: number): void {
    const swing = this.#swing;
    const ahead = swing === undefined ? Infinity : Math.abs(swing.start + swing.total - at);
    const behind = this.#lastHit === undefined ? Infinity : Math.abs(at - this.#lastHit);
    if (ahead < behind) {
      this.#pendingDouble = true;
    } else if (this.#lastHit !== undefined && this.#lastDouble !== this.#lastHit) {
      this.#markDouble();
    }
  }

  /** Where the swing is at match time `at`. */
  public frame(at: number, weaponId: WeaponId): AttackFrame {
    const frame = this.#mainFrame(at, weaponId);
    const offHand =
      this.#lastDouble === undefined
        ? undefined
        : offHandClip(WEAPON_MOTION[weaponId], at - this.#lastDouble);
    return offHand === undefined ? frame : { ...frame, offHand };
  }

  /** The main hand's frame: the one that hits, alternating hands hit by hit. */
  #mainFrame(at: number, weaponId: WeaponId): AttackFrame {
    const m = WEAPON_MOTION[weaponId];
    if (this.#cast !== undefined) {
      const progress = this.#castProgress(at);
      return { clip: { phase: "wind-up", progress }, hit: this.#hits + 1 };
    }
    const castStrike = this.#castStrike;
    if (castStrike !== undefined && at < castStrike + m.strike) {
      const progress = unit((at - castStrike) / m.strike);
      return { clip: { phase: "strike", progress }, hit: this.#hits };
    }
    const settle = this.#settle;
    if (settle !== undefined) {
      const progress = (at - settle.at) / m.recover;
      if (progress < 1) {
        return {
          clip: { phase: "settle", progress: unit(progress), from: settle.from },
          hit: settle.hit,
        };
      }
    }
    const swing = this.#swingFrame(at, weaponId);
    if (swing !== undefined) {
      return swing;
    }
    // A double strike's main hand is the hit before its off hand's.
    const hit =
      this.#lastDouble !== undefined && this.#lastDouble === this.#lastHit
        ? this.#hits - 1
        : this.#hits;
    if (this.#lastHit !== undefined) {
      const sinceHit = Math.max(0, at - this.#lastHit);
      if (sinceHit < m.hold) {
        return { clip: { phase: "hold", progress: unit(sinceHit / m.hold), sinceHit }, hit };
      }
      if (sinceHit < m.hold + m.recover) {
        const progress = unit((sinceHit - m.hold) / m.recover);
        return { clip: { phase: "recover", progress, sinceHit }, hit };
      }
    }
    return { clip: REST_CLIP, hit };
  }

  /**
   * An attack skill's cast as this snapshot has it: started, run on, run
   * out (its blow) or stopped short (eased back to rest).
   */
  #observeCast(at: number, cast: AttackCast | undefined, weaponId: WeaponId): void {
    const last = this.#castObserved;
    if (last?.at === at) {
      return;
    }
    const live = cast !== undefined && cast.total > 0 ? cast : undefined;
    this.#castObserved = live === undefined ? undefined : { at, elapsed: live.elapsed };
    const running = this.#cast;
    if (running !== undefined && last !== undefined) {
      if (live !== undefined && live.elapsed >= last.elapsed - WIRE_EPSILON) {
        // The same cast, run on or slowed.
        this.#cast = { start: at - live.elapsed, total: live.total };
        return;
      }
      if (last.elapsed + (at - last.at) >= running.total - WIRE_EPSILON) {
        this.#hits += 1;
        this.#castStrike = running.start + running.total;
        this.#lastHit = this.#castStrike + WEAPON_MOTION[weaponId].strike;
      } else {
        const from: SwingClip = { phase: "wind-up", progress: this.#castProgress(at) };
        this.#settle = { at, from, hit: this.#hits + 1 };
      }
    }
    this.#cast = live === undefined ? undefined : { start: at - live.elapsed, total: live.total };
    this.#castShown = live?.elapsed ?? 0;
    if (live !== undefined) {
      // The cast replaces whatever the swing was showing; it does not blend.
      this.#settle = undefined;
    }
  }

  /** How far the cast under way has wound up at `at`, 0 … 1, never going back. */
  #castProgress(at: number): number {
    const cast = this.#cast;
    if (cast === undefined) {
      return 0;
    }
    const elapsed = Math.min(cast.total, Math.max(this.#castShown, at - cast.start));
    this.#castShown = elapsed;
    return unit(elapsed / cast.total);
  }

  /** The last hit struck twice: the off hand's stab is a hit of its own. */
  #markDouble(): void {
    this.#hits += 1;
    this.#lastDouble = this.#lastHit;
    this.#pendingDouble = false;
  }

  #begin(at: number, elapsed: number, total: number): void {
    this.#swing = total > 0 ? { start: at - elapsed, total } : undefined;
    this.#shown = elapsed;
  }

  /** The wind-up or strike at `at`, belonging to the next hit; `undefined` before the wind-up. */
  #swingFrame(at: number, weaponId: WeaponId): SwingFrame | undefined {
    const swing = this.#swing;
    if (swing === undefined) {
      return undefined;
    }
    const elapsed = Math.min(swing.total, Math.max(this.#shown, at - swing.start));
    this.#shown = elapsed;
    const m = WEAPON_MOTION[weaponId];
    const strikeAt = swing.total - m.strike;
    const windAt = strikeAt - m.windUp;
    if (elapsed < windAt) {
      return undefined;
    }
    const hit = this.#hits + 1;
    if (elapsed < strikeAt) {
      return { clip: { phase: "wind-up", progress: unit((elapsed - windAt) / m.windUp) }, hit };
    }
    return { clip: { phase: "strike", progress: unit((elapsed - strikeAt) / m.strike) }, hit };
  }
}

/** The frame an actor's mark shows: always at rest under reduced motion (#536 §9). */
export function shownFrame(
  clock: AttackClock | undefined,
  at: number,
  weaponId: WeaponId,
  reducedMotion: boolean,
): AttackFrame {
  return clock === undefined || reducedMotion ? REST_FRAME : clock.frame(at, weaponId);
}
