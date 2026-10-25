import { add, dot, lengthSquared, scale, sub, type Vec2 } from "../vec2.js";
import type { WeaponSnapshot } from "./weapon-attack.js";

/**
 * A ranged weapon's shot in flight (#159).
 *
 * GW1 aims a projectile where the target will be if it keeps moving as it
 * moves now, and checks nothing else until it lands. So walking steadily
 * in any direction does not dodge; stopping, turning or reversing after
 * the release does, because the shot lands where you would have been.
 *
 * It flies straight through walls and bodies alike: obstruction is
 * checked once, at release, in GW1, and not at all here yet.
 */
export interface Projectile {
  /** Deterministic: a counter, per match. */
  readonly id: number;
  readonly attackerId: string;
  readonly targetId: string;
  readonly from: Vec2;
  /** Where it lands, led ahead of the target at release. */
  readonly aimPoint: Vec2;
  /** World units per second. */
  readonly speed: number;
  readonly flightSeconds: number;
  /** Seconds since release; it lands once this reaches `flightSeconds`. */
  elapsed: number;
  /** The weapon and rank it was released with. */
  readonly weaponSnapshot: WeaponSnapshot;
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
