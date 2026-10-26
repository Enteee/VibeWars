import type { WeaponId } from "@vibewars/game-core";

import { REST_CLIP, WEAPON_MOTION, type AttackClip, type SwingClip } from "./weapon-pose.js";

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
 *
 * No Phaser here, so it is tested in Node.
 */

/** The wire rounds the swing timer to the millisecond (`match-host.ts`): less is noise. */
const WIRE_EPSILON = 0.002;

/** A clip, and which hit it belongs to, so two-handed weapons alternate hands. */
export interface AttackFrame {
  readonly clip: AttackClip;
  readonly hit: number;
}

export const REST_FRAME: AttackFrame = { clip: REST_CLIP, hit: 0 };

/** A wind-up or a strike, and the hit it leads to. */
interface SwingFrame extends AttackFrame {
  readonly clip: SwingClip;
}

const unit = (t: number): number => Math.max(0, Math.min(1, t));

export class AttackClock {
  /** The swing under way: when it started on the match clock, and its length. */
  #swing: { readonly start: number; readonly total: number } | undefined;
  /** The last snapshot's reading of it. */
  #observed: { readonly at: number; readonly elapsed: number } | undefined;
  /** How far into the swing the mark has been shown, which it never goes back from. */
  #shown = 0;
  #hits = 0;
  /** When the last hit landed; `undefined` before the first. */
  #lastHit: number | undefined;
  /** A swing that stopped short, easing back to rest from where it was. */
  #settle: { readonly at: number; readonly from: SwingClip; readonly hit: number } | undefined;

  /**
   * A snapshot taken at match time `at` says the actor is `elapsed` into a
   * swing of `total` seconds; `total` 0 when it does not attack. The same
   * snapshot seen again is ignored.
   */
  public observe(at: number, elapsed: number, total: number, weaponId: WeaponId): void {
    const last = this.#observed;
    if (last?.at === at) {
      return;
    }
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
    } else {
      const shown = this.#swingFrame(at, weaponId);
      if (shown !== undefined) {
        this.#settle = { at, from: shown.clip, hit: shown.hit };
      }
    }
    this.#begin(at, elapsed, total);
  }

  /** Where the swing is at match time `at`. */
  public frame(at: number, weaponId: WeaponId): AttackFrame {
    const m = WEAPON_MOTION[weaponId];
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
    const hit = this.#hits;
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
