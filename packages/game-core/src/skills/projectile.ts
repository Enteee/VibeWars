import { add, dot, lengthSquared, scale, sub, vec2, ZERO, type Vec2 } from "../vec2.js";
import type { OwnSkillBoost, StatusId } from "./status.js";
import type { Combatant, Skill } from "./types.js";
import type { BlowRule, NextAttackSkill, WeaponSnapshot } from "./weapon-attack.js";

/**
 * A ranged weapon's shot in flight (#159).
 *
 * GW1 aims a projectile where the target will be if it keeps moving as it
 * moves now, and checks nothing else until it lands. So walking steadily
 * in any direction does not dodge; stopping, turning or reversing after
 * the release does, because the shot lands where you would have been.
 *
 * Its path is fixed at release, so walls are decided then too (#215): a
 * shot whose path crosses a wall is cut short at it, flies there, and
 * lands `obstructed`. It still flies through bodies.
 *
 * A spell can fly too (#535): Fireball is the same led shot, carrying the
 * cast instead of a blow.
 */
export interface Projectile {
  /** Deterministic: a counter, per match. */
  readonly id: number;
  readonly attackerId: string;
  readonly targetId: string;
  readonly from: Vec2;
  /**
   * Where it lands, led ahead of the target at release; or, if a wall is
   * in the way, just short of the wall.
   */
  readonly aimPoint: Vec2;
  /** Cut short by a wall: it lands as `attack-obstructed`, whoever is where. */
  readonly obstructed: boolean;
  /** World units per second. */
  readonly speed: number;
  readonly flightSeconds: number;
  /** Seconds since release; it lands once this reaches `flightSeconds`. */
  elapsed: number;
  /** The weapon and rank it was released with. */
  readonly weaponSnapshot: WeaponSnapshot;
  /**
   * The attack skill (#416) or spell (#535) it carries, or `undefined`
   * for a swing's shot.
   */
  readonly skillHit: SkillHit | SpellHit | undefined;
  /** A status of its attacker's made it unblockable as it left (#1604, Guiding Hands). */
  readonly unblockable: boolean;
  /** The statuses its release used up (#1916): their riders land with it, as Poison Tip Signet's. */
  readonly spent: readonly StatusId[];
}

/**
 * An attack skill riding a shot (#416): its blow, the bonus fixed at
 * release, and the skill whose riders, or `onBlocked` effects, land
 * with it.
 */
export interface SkillHit {
  readonly kind: "attack";
  readonly skill: Skill;
  readonly blow: BlowRule;
  /** The chants it took at release (#758): their riders land with it. */
  readonly next: NextAttackSkill;
  /** What the attacker's statuses did to it at release (#1761): its riders land with it. */
  readonly own: OwnSkillBoost | undefined;
  /** Its blows on its victim, read at release (#1914): Forked Arrow's one or two. */
  readonly strikes: number;
}

/**
 * A spell in flight (#535): its effects and area land with it, cast by
 * `caster` with the ranks it had at release, even if it has died or
 * left since.
 */
export interface SpellHit {
  readonly kind: "spell";
  readonly skill: Skill;
  readonly caster: Combatant;
  /** What the caster's statuses did to it at release (#1761): its heals and statuses land with it. */
  readonly own: OwnSkillBoost | undefined;
  /** The attribute a status lent it at release (#1929), Signet of Illusions' Illusion Magic. */
  readonly lent: string | undefined;
}

/**
 * Where a shot at `speed` from `from` meets a target at `targetPos`
 * moving at `targetVelocity`: `targetPos + targetVelocity * t` for the
 * smallest positive `t` with `|targetPos + targetVelocity * t - from| =
 * speed * t`.
 *
 * A target that outruns the shot gives no such `t`; it is aimed at where
 * it stands, and will be missed.
 */
export function leadAimPoint(
  from: Vec2,
  targetPos: Vec2,
  targetVelocity: Vec2,
  speed: number,
): Vec2 {
  // |d + v t|^2 = s^2 t^2, as a t^2 + b t + c = 0.
  const d = sub(targetPos, from);
  const a = lengthSquared(targetVelocity) - speed * speed;
  const b = 2 * dot(d, targetVelocity);
  const c = lengthSquared(d);
  const t = smallestPositiveRoot(a, b, c);
  return t === undefined ? targetPos : add(targetPos, scale(targetVelocity, t));
}

function smallestPositiveRoot(a: number, b: number, c: number): number | undefined {
  if (Math.abs(a) < 1e-9) {
    // The target moves exactly as fast as the shot: b t + c = 0.
    const t = b === 0 ? undefined : -c / b;
    return t !== undefined && t > 0 ? t : undefined;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return undefined;
  }
  const root = Math.sqrt(discriminant);
  const positive = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter((t) => t > 0);
  return positive.length === 0 ? undefined : Math.min(...positive);
}

/** Where a target is and how it is moving, as a shot sees it. */
export interface Track {
  readonly position: Vec2;
  readonly velocity: Vec2;
}

/**
 * The target's motion over its recent positions: a least-squares line
 * through `samples` (oldest first, `dt` apart), read at the newest one.
 *
 * Not the last tick's step: a target tapping back and forth every few
 * ticks moves at full speed every tick yet goes nowhere, and a shot led
 * by that step would miss it every time. The fit aims at the middle of
 * the wobble instead, and is exact for a target walking straight. Under
 * two samples, or no time between them, there is no motion to read, so
 * the target stands at its newest position, or at `current`.
 */
export function trackTarget(samples: readonly Vec2[], dt: number, current: Vec2): Track {
  const count = samples.length;
  const newest = samples[count - 1] ?? current;
  if (count < 2 || !(dt > 0)) {
    return { position: newest, velocity: ZERO };
  }
  // Sample i is at time i * dt; centre the times on their mean.
  const meanTime = ((count - 1) * dt) / 2;
  let meanX = 0;
  let meanY = 0;
  for (const sample of samples) {
    meanX += sample.x / count;
    meanY += sample.y / count;
  }
  let spread = 0;
  let slopeX = 0;
  let slopeY = 0;
  samples.forEach((sample, index) => {
    const time = index * dt - meanTime;
    spread += time * time;
    slopeX += time * (sample.x - meanX);
    slopeY += time * (sample.y - meanY);
  });
  const velocity = vec2(slopeX / spread, slopeY / spread);
  return {
    position: add(vec2(meanX, meanY), scale(velocity, (count - 1) * dt - meanTime)),
    velocity,
  };
}

/**
 * A participant's last positions, one per tick, oldest first: the ring
 * buffer `trackTarget` reads. Cleared whenever the participant jumps, so
 * a fit never spans a teleport.
 */
export class PositionHistory {
  readonly #capacity: number;
  readonly #ring: Vec2[] = [];
  /** Index of the oldest sample, once the ring is full. */
  #start = 0;

  public constructor(capacity: number) {
    this.#capacity = Math.max(1, capacity);
  }

  public push(position: Vec2): void {
    if (this.#ring.length < this.#capacity) {
      this.#ring.push(position);
      return;
    }
    this.#ring[this.#start] = position;
    this.#start = (this.#start + 1) % this.#capacity;
  }

  public clear(): void {
    this.#ring.length = 0;
    this.#start = 0;
  }

  public samples(): Vec2[] {
    return [...this.#ring.slice(this.#start), ...this.#ring.slice(0, this.#start)];
  }
}
