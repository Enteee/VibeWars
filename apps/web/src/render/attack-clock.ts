import { WEAPONS, type WeaponId } from "@vibewars/game-core";

import { REST_CLIP, WEAPON_MOTION, type AttackClip, type SwingClip } from "./weapon-pose.js";

/**
 * One actor's attack, as the weapon mark plays it (#536 step 1, #558):
 * anchored on the hits the client sees and predicted between them, on the
 * scene clock, never the snapshot's, so it does not stutter on a late
 * snapshot. The swing timer is not on the wire yet (#560).
 *
 * - A melee hit is the weapon's combat message; a ranged one is its shot's
 *   first appearance. Either ends a strike, then hold and recover play.
 * - While the actor attacks, the next wind-up starts at
 *   `lastHit + interval − (windUp + strike)`, so its strike ends on the
 *   next hit.
 * - A predicted hit that does not come within the strike plus
 *   `HIT_GRACE_SECONDS` eases back to rest over the recover time, as does a
 *   swing cut short by the attack ending or a switch of target. Never a snap.
 * - A hit nobody predicted, the first of an attack or after a switch,
 *   plays strike → hold → recover from the hit.
 *
 * No Phaser here, so it is tested in Node.
 */

/** How late a predicted hit may be before the swing gives up on it. */
export const HIT_GRACE_SECONDS = 0.1;

/** A clip, and which hit it belongs to, so two-handed weapons alternate hands. */
export interface AttackFrame {
  readonly clip: AttackClip;
  readonly hit: number;
}

export const REST_FRAME: AttackFrame = { clip: REST_CLIP, hit: 0 };

const unit = (t: number): number => Math.max(0, Math.min(1, t));

export class AttackClock {
  /** When the last hit was seen; `undefined` before the first. */
  #lastHit: number | undefined;
  #hits = 0;
  /** The last hit was not predicted, so its strike plays after it. */
  #delayed = false;
  /** The next swing is predicted from the last hit. */
  #predicting = false;
  /** Who the actor attacks, as the snapshot last said. */
  #target: string | undefined;
  /** A swing that stopped short, easing back to rest from where it was. */
  #settle: { readonly at: number; readonly from: SwingClip; readonly hit: number } | undefined;

  /** Note who the actor attacks at `at`: a stop or a switch ends the swing under way. */
  public observe(at: number, target: string | undefined, weaponId: WeaponId): void {
    if (target === this.#target) {
      return;
    }
    const was = this.#target;
    this.#target = target;
    if (was === undefined) {
      // The attack's first hit may have come before the snapshot said so.
      this.#predicting =
        this.#lastHit !== undefined && at - this.#lastHit < WEAPONS[weaponId].attackIntervalSeconds;
      return;
    }
    const { clip, hit } = this.#swing(at, weaponId);
    if (clip.phase === "wind-up" || (clip.phase === "strike" && !clip.fromRest)) {
      this.#settle = { at, from: clip, hit };
    }
    this.#predicting = false;
  }

  /** A hit landed, or a shot left, at `at`. */
  public hit(at: number, weaponId: WeaponId): void {
    const { clip } = this.frame(at, weaponId);
    const anchored = clip.phase === "wind-up" || (clip.phase === "strike" && !clip.fromRest);
    this.#lastHit = at;
    this.#delayed = !anchored;
    this.#hits += 1;
    this.#settle = undefined;
    this.#predicting = this.#target !== undefined;
  }

  /** Where the swing is at `at`. */
  public frame(at: number, weaponId: WeaponId): AttackFrame {
    const settle = this.#settle;
    if (settle !== undefined) {
      const progress = (at - settle.at) / WEAPON_MOTION[weaponId].recover;
      if (progress < 1) {
        return {
          clip: { phase: "settle", progress: unit(progress), from: settle.from },
          hit: settle.hit,
        };
      }
    }
    return this.#swing(at, weaponId);
  }

  #swing(at: number, weaponId: WeaponId): AttackFrame {
    const lastHit = this.#lastHit;
    if (lastHit === undefined) {
      return REST_FRAME;
    }
    const m = WEAPON_MOTION[weaponId];
    const hit = this.#hits;
    const holdAt = lastHit + (this.#delayed ? m.strike : 0);
    if (at < holdAt) {
      const progress = unit((at - lastHit) / m.strike);
      return { clip: { phase: "strike", progress, fromRest: true }, hit };
    }
    const sinceHit = at - holdAt;
    if (sinceHit < m.hold) {
      return { clip: { phase: "hold", progress: unit(sinceHit / m.hold), sinceHit }, hit };
    }
    if (sinceHit < m.hold + m.recover) {
      const progress = unit((sinceHit - m.hold) / m.recover);
      return { clip: { phase: "recover", progress, sinceHit }, hit };
    }
    if (!this.#predicting) {
      return { clip: REST_CLIP, hit };
    }
    // The next swing belongs to the next hit.
    const next = lastHit + WEAPONS[weaponId].attackIntervalSeconds;
    const strikeAt = next - m.strike;
    const windAt = strikeAt - m.windUp;
    if (at < windAt) {
      return { clip: REST_CLIP, hit };
    }
    if (at < strikeAt) {
      return { clip: { phase: "wind-up", progress: unit((at - windAt) / m.windUp) }, hit: hit + 1 };
    }
    if (at < next + HIT_GRACE_SECONDS) {
      const progress = unit((at - strikeAt) / m.strike);
      return { clip: { phase: "strike", progress, fromRest: false }, hit: hit + 1 };
    }
    // The hit never came: back to rest from the end of the strike.
    const progress = (at - next - HIT_GRACE_SECONDS) / m.recover;
    if (progress < 1) {
      const from: SwingClip = { phase: "strike", progress: 1, fromRest: false };
      return { clip: { phase: "settle", progress: unit(progress), from }, hit: hit + 1 };
    }
    return { clip: REST_CLIP, hit };
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
