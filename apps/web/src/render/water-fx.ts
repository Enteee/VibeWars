/**
 * Water in motion (#4061): the wake a body leaves wading through shallow
 * water, and the splash of a body stepping into it or a shot landing on
 * water. Purely visual: the rings and droplets are positions over time,
 * pooled and capped so a crowd at the fountain costs the same every
 * frame. Under reduced motion there is no wake and no droplet; a splash
 * is one still ring.
 *
 * No Phaser here, so the particles can be tested in Node.
 */

import { seeded } from "./zone-painter.js";

/** World units walked in shallow water between two wake rings. */
export const WAKE_SPACING = 40;
/** Seconds a wake ring takes to spread and fade. */
export const WAKE_SECONDS = 0.8;
/** Seconds a splash's ring takes to spread and fade. */
export const SPLASH_RING_SECONDS = 0.6;
/** Seconds a splash's still ring shows under reduced motion. */
export const STILL_RING_SECONDS = 0.3;
/** The longest a droplet is in the air: every one is back down by then. */
export const DROPLET_SECONDS = 0.4;
/** The fewest and most droplets one splash throws. */
export const SPLASH_DROPLETS_MIN = 6;
export const SPLASH_DROPLETS_MAX = 8;
/** The most live rings, wake and splash, and droplets: the oldest go first. */
export const MAX_WATER_RINGS = 48;
export const MAX_WATER_DROPLETS = 64;
/** A step longer than this many wake spacings is a jump, not a wade: no ring. */
const WAKE_JUMP = 3;

/** One spreading ring on the water, its radius from `from` to `to` over its life. */
export interface WaterRing {
  x: number;
  y: number;
  layer: number;
  age: number;
  life: number;
  from: number;
  to: number;
  alpha: number;
  /** A still ring (reduced motion): it neither spreads nor fades. */
  still: boolean;
}

/** One droplet thrown up from `x`, `y`, rising `rise` world units at its height. */
export interface WaterDroplet {
  x: number;
  y: number;
  layer: number;
  age: number;
  life: number;
  vx: number;
  vy: number;
  rise: number;
  size: number;
}

/** A body as the water sees it: where it stands, unlifted. */
export interface WadingBody {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly layer: number;
  readonly dead: boolean;
}

/** The depth of the water at `at` on `layer`, or `undefined` on dry ground. */
export type WaterAt = (
  at: { readonly x: number; readonly y: number },
  layer: number,
) => "deep" | "shallow" | undefined;

/** Where a body was last frame, and how far it has waded since its last wake ring. */
interface Wader {
  x: number;
  y: number;
  layer: number;
  wet: boolean;
  walked: number;
  /** The step it was last seen in. */
  seen: number;
}

/** The painting calls the water's motion needs, in Phaser `Graphics` terms. */
export interface WaterFxPainter {
  lineStyle(width: number, colour: number, alpha: number): void;
  strokeEllipse(x: number, y: number, width: number, height: number): void;
  fillStyle(colour: number, alpha: number): void;
  fillCircle(x: number, y: number, radius: number): void;
}

/** `ring`'s radius and alpha at its age: spreading and fading out, eased. */
export function ringAt(ring: WaterRing): { readonly radius: number; readonly alpha: number } {
  if (ring.still) {
    return { radius: ring.to, alpha: ring.alpha };
  }
  const t = Math.min(1, ring.age / ring.life);
  const spread = 1 - (1 - t) ** 2;
  return { radius: ring.from + (ring.to - ring.from) * spread, alpha: ring.alpha * (1 - t) };
}

/** Where `droplet` is drawn at its age: out along the floor, up and back down. */
export function dropletAt(droplet: WaterDroplet): { readonly x: number; readonly y: number } {
  const t = Math.min(1, droplet.age / droplet.life);
  return {
    x: droplet.x + droplet.vx * droplet.age,
    y: droplet.y + droplet.vy * droplet.age - 4 * droplet.rise * t * (1 - t),
  };
}

/** Paint every ring and droplet on `layer` in `colour`. */
export function paintWaterFx(
  painter: WaterFxPainter,
  fx: WaterFx,
  layer: number,
  line: number,
  colour: number,
): void {
  for (const ring of fx.rings()) {
    if (ring.layer !== layer) {
      continue;
    }
    const { radius, alpha } = ringAt(ring);
    painter.lineStyle(1.5 * line, colour, alpha);
    // Flat as the floor is, as the water's own ripples are.
    painter.strokeEllipse(ring.x, ring.y, 2 * radius, radius);
  }
  for (const droplet of fx.droplets()) {
    if (droplet.layer !== layer) {
      continue;
    }
    const { x, y } = dropletAt(droplet);
    painter.fillStyle(colour, 0.85);
    painter.fillCircle(x, y, droplet.size);
  }
}

/**
 * Every wake and splash on the water. `step` follows the bodies: one
 * wading leaves a ring each `WAKE_SPACING` walked, one stepping from dry
 * ground into shallow water splashes. `splash` is a shot landing. Rings
 * and droplets live in pools of `MAX_WATER_RINGS` and
 * `MAX_WATER_DROPLETS`, reused oldest first.
 */
export class WaterFx {
  private readonly liveRings: WaterRing[] = [];
  private readonly spareRings: WaterRing[] = [];
  private readonly liveDroplets: WaterDroplet[] = [];
  private readonly spareDroplets: WaterDroplet[] = [];
  private readonly waders = new Map<string, Wader>();
  /** Bumped every splash, so no two throw their droplets alike. */
  private splashes = 0;
  /** Bumped every step, to tell the bodies gone from the ones still here. */
  private steps = 0;

  /** The live rings, oldest first. */
  public rings(): readonly WaterRing[] {
    return this.liveRings;
  }

  /** The live droplets, oldest first. */
  public droplets(): readonly WaterDroplet[] {
    return this.liveDroplets;
  }

  /** Age everything by `dt` seconds, then wake or splash under `bodies` in `waterAt`'s water. */
  public step(
    bodies: readonly WadingBody[],
    waterAt: WaterAt,
    dt: number,
    reducedMotion: boolean,
  ): void {
    this.age(dt);
    this.steps += 1;
    for (const body of bodies) {
      if (body.dead) {
        continue;
      }
      const { x, y } = body.position;
      const wet = waterAt(body.position, body.layer) === "shallow";
      const was = this.waders.get(body.id);
      if (was === undefined) {
        // First seen: it was already where it is, so it neither splashes nor wakes.
        this.waders.set(body.id, {
          x,
          y,
          layer: body.layer,
          wet,
          walked: 0,
          seen: this.steps,
        });
        continue;
      }
      const moved = Math.hypot(x - was.x, y - was.y);
      const sameLayer = was.layer === body.layer;
      if (wet && !was.wet && sameLayer) {
        this.splash(x, y, body.layer, reducedMotion);
        was.walked = 0;
      } else if (wet && sameLayer && moved <= WAKE_SPACING * WAKE_JUMP) {
        was.walked += moved;
        if (was.walked >= WAKE_SPACING) {
          was.walked -= WAKE_SPACING;
          if (!reducedMotion) {
            this.wake(x, y, body.layer);
          }
        }
      } else {
        was.walked = 0;
      }
      was.x = x;
      was.y = y;
      was.layer = body.layer;
      was.wet = wet;
      was.seen = this.steps;
    }
    for (const [id, wader] of this.waders) {
      if (wader.seen !== this.steps) {
        this.waders.delete(id);
      }
    }
  }

  /**
   * A splash at `x`, `y` on `layer`: one ring spreads and
   * `SPLASH_DROPLETS_MIN` to `SPLASH_DROPLETS_MAX` droplets arc up and
   * fall back. Under reduced motion, one still ring.
   */
  public splash(x: number, y: number, layer: number, reducedMotion: boolean): void {
    this.splashes += 1;
    if (reducedMotion) {
      this.ring(x, y, layer, 0, 10, STILL_RING_SECONDS, 0.6, true);
      return;
    }
    this.ring(x, y, layer, 3, 18, SPLASH_RING_SECONDS, 0.7, false);
    const random = seeded(this.splashes * 2654435761);
    const span = SPLASH_DROPLETS_MAX - SPLASH_DROPLETS_MIN + 1;
    const count = SPLASH_DROPLETS_MIN + Math.min(span - 1, Math.floor(random() * span));
    for (let k = 0; k < count; k += 1) {
      const angle = ((k + random() * 0.6) / count) * 2 * Math.PI;
      const speed = 18 + random() * 22;
      const droplet = this.nextDroplet();
      droplet.x = x;
      droplet.y = y;
      droplet.layer = layer;
      droplet.age = 0;
      droplet.life = DROPLET_SECONDS * (0.6 + 0.4 * random());
      droplet.vx = Math.cos(angle) * speed;
      // The floor is seen at a slant: across it, a droplet travels half as far.
      droplet.vy = Math.sin(angle) * speed * 0.5;
      droplet.rise = 8 + random() * 8;
      droplet.size = 1 + random() * 0.8;
    }
  }

  /** Everything gone, as when the scene ends. */
  public clear(): void {
    this.spareRings.push(...this.liveRings);
    this.liveRings.length = 0;
    this.spareDroplets.push(...this.liveDroplets);
    this.liveDroplets.length = 0;
    this.waders.clear();
  }

  private wake(x: number, y: number, layer: number): void {
    this.ring(x, y, layer, 5, 20, WAKE_SECONDS, 0.5, false);
  }

  private ring(
    x: number,
    y: number,
    layer: number,
    from: number,
    to: number,
    life: number,
    alpha: number,
    still: boolean,
  ): void {
    if (this.liveRings.length >= MAX_WATER_RINGS) {
      const oldest = this.liveRings.shift();
      if (oldest !== undefined) {
        this.spareRings.push(oldest);
      }
    }
    const ring = this.spareRings.pop() ?? {
      x: 0,
      y: 0,
      layer: 0,
      age: 0,
      life: 0,
      from: 0,
      to: 0,
      alpha: 0,
      still: false,
    };
    ring.x = x;
    ring.y = y;
    ring.layer = layer;
    ring.age = 0;
    ring.life = life;
    ring.from = from;
    ring.to = to;
    ring.alpha = alpha;
    ring.still = still;
    this.liveRings.push(ring);
  }

  private nextDroplet(): WaterDroplet {
    if (this.liveDroplets.length >= MAX_WATER_DROPLETS) {
      const oldest = this.liveDroplets.shift();
      if (oldest !== undefined) {
        this.spareDroplets.push(oldest);
      }
    }
    const droplet = this.spareDroplets.pop() ?? {
      x: 0,
      y: 0,
      layer: 0,
      age: 0,
      life: 0,
      vx: 0,
      vy: 0,
      rise: 0,
      size: 0,
    };
    this.liveDroplets.push(droplet);
    return droplet;
  }

  /** Age every ring and droplet by `dt`, dropping the ones whose life is over, order kept. */
  private age(dt: number): void {
    let kept = 0;
    for (const ring of this.liveRings) {
      ring.age += dt;
      if (ring.age >= ring.life) {
        this.spareRings.push(ring);
      } else {
        this.liveRings[kept] = ring;
        kept += 1;
      }
    }
    this.liveRings.length = kept;
    kept = 0;
    for (const droplet of this.liveDroplets) {
      droplet.age += dt;
      if (droplet.age >= droplet.life) {
        this.spareDroplets.push(droplet);
      } else {
        this.liveDroplets[kept] = droplet;
        kept += 1;
      }
    }
    this.liveDroplets.length = kept;
  }
}
