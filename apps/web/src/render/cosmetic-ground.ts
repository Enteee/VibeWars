/**
 * The ground cosmetics (ADR-0056 §4, #3578): a ground aura at a body's
 * feet and the footstep trail it leaves. Purely visual, drawn on the
 * body's layer under every ward, zone, ring and body there
 * (`render-order.ts`). The trail's motes are pooled and capped, per body
 * and per scene, so a crowd costs the same every frame.
 */

import type { CosmeticLook } from "../cosmetics/catalog.js";
import type { WornCosmetics } from "../cosmetics/selection.js";
import type { Painter } from "./body-painter.js";

/** How long a footstep mote takes to fade, seconds. */
export const TRAIL_SECONDS = 0.6;
/** The most motes one body leaves at once. */
export const TRAIL_MOTES_PER_BODY = 24;
/** The most motes a scene keeps at once: past it, the oldest goes first. */
export const TRAIL_MOTES_PER_SCENE = 256;
/** How far a body walks between two motes, as a share of its radius. */
const MOTE_STEP_OF_BODY = 0.9;
/** A move longer than this, a share of the radius, is a teleport or a lift: no mote in between. */
const MOTE_JUMP_OF_BODY = 6;
/** How small a mote shrinks to as it fades, a share of its size. */
const MOTE_END_SIZE = 0.6;

/** One aura breath, seconds; and its low point, a share of the full aura. */
const AURA_BREATH_SECONDS = 3.2;
const AURA_BREATH_LOW = 0.7;
/** One turn of an aura's sparks round the body, seconds. */
const SPARK_TURN_SECONDS = 7;
/**
 * The aura's fill and its rim and sparks, each a share of the look's
 * alpha: where they overlap they stay under it (1 − 0.9 × 0.75 < 1).
 */
const AURA_FILL_SHARE = 0.1 / 0.3;
const AURA_RIM_SHARE = 0.25 / 0.3;
/** The rim's width and a spark's size, shares of the aura's reach. */
const AURA_RIM_OF_REACH = 0.18;
const SPARK_OF_REACH = 0.3;

/** As much of a drawn body as its ground cosmetics read. */
export interface GroundBody {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly radius: number;
  readonly layer: number;
  readonly dead: boolean;
  readonly cosmetics: WornCosmetics;
}

/** A footstep mote: where, on which layer, how big, and how old. */
export interface TrailMote {
  owner: string;
  x: number;
  y: number;
  layer: number;
  size: number;
  colour: number;
  alpha: number;
  age: number;
}

type AuraLook = Extract<CosmeticLook, { readonly kind: "aura" }>;

/** `body`'s aura look, if it wears one and stands. */
export function auraOf(body: GroundBody): AuraLook | undefined {
  const look = body.cosmetics.aura?.look;
  return look?.kind === "aura" && !body.dead ? look : undefined;
}

/**
 * The aura's strength at `now`, seconds, from its low point to 1, offset
 * by `phase` so two bodies do not breathe as one; under reduced motion it
 * holds still at full.
 */
export function auraBreath(now: number, phase: number, reducedMotion: boolean): number {
  if (reducedMotion) {
    return 1;
  }
  const wave = (1 - Math.cos(2 * Math.PI * (now / AURA_BREATH_SECONDS + phase))) / 2;
  return AURA_BREATH_LOW + (1 - AURA_BREATH_LOW) * wave;
}

/**
 * The aura of a body of radius `r` at (`x`, `y`): a soft disc out to its
 * reach past the rim, a rim there, and its sparks turning on it, still
 * under reduced motion. The body, drawn over it, covers its middle.
 */
export function paintAura(
  painter: Painter,
  x: number,
  y: number,
  r: number,
  look: AuraLook,
  now: number,
  phase: number,
  reducedMotion: boolean,
): void {
  if (look.ground === null) {
    return;
  }
  const reach = r * look.ground.radiusOfBody;
  const outer = r + reach;
  const alpha = look.ground.alpha * auraBreath(now, phase, reducedMotion);
  painter.fillStyle(look.colour, alpha * AURA_FILL_SHARE);
  painter.fillCircle(x, y, outer);
  const rim = reach * AURA_RIM_OF_REACH;
  painter.lineStyle(rim, look.colour, alpha * AURA_RIM_SHARE);
  painter.strokeCircle(x, y, outer - rim / 2);
  const turn = reducedMotion ? 0 : (2 * Math.PI * now) / SPARK_TURN_SECONDS;
  const ring = r + reach / 2;
  painter.fillStyle(look.colour, alpha * AURA_RIM_SHARE);
  for (let index = 0; index < look.sparks; index += 1) {
    const angle = turn + (2 * Math.PI * (index + phase)) / look.sparks;
    painter.fillCircle(
      x + Math.cos(angle) * ring,
      y + Math.sin(angle) * ring,
      (reach * SPARK_OF_REACH) / 2,
    );
  }
}

/** A mote's size and alpha at its age: it fades and shrinks to nothing in `TRAIL_SECONDS`. */
export function moteFade(mote: TrailMote): { readonly size: number; readonly alpha: number } {
  const left = Math.max(0, 1 - mote.age / TRAIL_SECONDS);
  return {
    size: mote.size * (MOTE_END_SIZE + (1 - MOTE_END_SIZE) * left),
    alpha: mote.alpha * left,
  };
}

/** Paint `motes`, each as it has faded. */
export function paintMotes(painter: Painter, motes: readonly TrailMote[]): void {
  for (const mote of motes) {
    const { size, alpha } = moteFade(mote);
    painter.fillStyle(mote.colour, alpha);
    painter.fillCircle(mote.x, mote.y, size);
  }
}

/**
 * Every body's footstep trail: a mote dropped each `MOTE_STEP_OF_BODY` of
 * a radius walked, faded out in `TRAIL_SECONDS`. The motes live in one
 * pool of `TRAIL_MOTES_PER_SCENE`, reused oldest first, and no body holds
 * more than `TRAIL_MOTES_PER_BODY`. Under reduced motion there is none.
 */
export class FootstepTrails {
  /** The live motes, oldest first. */
  private readonly live: TrailMote[] = [];
  /** Motes faded out, kept to be reused. */
  private readonly spare: TrailMote[] = [];
  /** Where each trailed body dropped its last mote. */
  private readonly lastStep = new Map<
    string,
    { readonly x: number; readonly y: number; readonly layer: number }
  >();
  /** How many live motes each body holds. */
  private readonly held = new Map<string, number>();

  /** The live motes, oldest first. */
  public motes(): readonly TrailMote[] {
    return this.live;
  }

  /** Age every mote by `dt` seconds and drop new ones under `bodies` that walked. */
  public step(bodies: readonly GroundBody[], dt: number, reducedMotion: boolean): void {
    if (reducedMotion) {
      this.clear();
      return;
    }
    let faded = 0;
    for (const mote of this.live) {
      mote.age += dt;
      if (mote.age >= TRAIL_SECONDS) {
        faded += 1;
      }
    }
    // Ages only grow and every mote lives as long, so the faded are the oldest.
    for (const mote of this.live.splice(0, faded)) {
      this.release(mote);
    }
    const trailed = new Set<string>();
    for (const body of bodies) {
      const look = body.cosmetics.trail?.look;
      if (look?.kind !== "trail" || look.ground === null || body.dead) {
        continue;
      }
      trailed.add(body.id);
      const { x, y } = body.position;
      const last = this.lastStep.get(body.id);
      const walked = last === undefined ? 0 : Math.hypot(x - last.x, y - last.y);
      if (last?.layer !== body.layer || walked > body.radius * MOTE_JUMP_OF_BODY) {
        this.lastStep.set(body.id, { x, y, layer: body.layer });
        continue;
      }
      if (walked < body.radius * MOTE_STEP_OF_BODY) {
        continue;
      }
      this.lastStep.set(body.id, { x, y, layer: body.layer });
      this.drop(body, look.colour, look.ground);
    }
    for (const id of this.lastStep.keys()) {
      if (!trailed.has(id)) {
        this.lastStep.delete(id);
      }
    }
  }

  /** Every mote gone, as when motion is reduced or the scene ends. */
  public clear(): void {
    for (const mote of this.live) {
      this.spare.push(mote);
    }
    this.live.length = 0;
    this.lastStep.clear();
    this.held.clear();
  }

  private drop(
    body: GroundBody,
    colour: number,
    ground: { readonly radiusOfBody: number; readonly alpha: number },
  ): void {
    if ((this.held.get(body.id) ?? 0) >= TRAIL_MOTES_PER_BODY) {
      const own = this.live.findIndex((mote) => mote.owner === body.id);
      this.release(...this.live.splice(own, 1));
    } else if (this.live.length >= TRAIL_MOTES_PER_SCENE) {
      this.release(...this.live.splice(0, 1));
    }
    const mote = this.spare.pop() ?? {
      owner: "",
      x: 0,
      y: 0,
      layer: 0,
      size: 0,
      colour: 0,
      alpha: 0,
      age: 0,
    };
    mote.owner = body.id;
    mote.x = body.position.x;
    mote.y = body.position.y;
    mote.layer = body.layer;
    mote.size = body.radius * ground.radiusOfBody;
    mote.colour = colour;
    mote.alpha = ground.alpha;
    mote.age = 0;
    this.live.push(mote);
    this.held.set(body.id, (this.held.get(body.id) ?? 0) + 1);
  }

  private release(...motes: TrailMote[]): void {
    for (const mote of motes) {
      const held = (this.held.get(mote.owner) ?? 1) - 1;
      if (held === 0) {
        this.held.delete(mote.owner);
      } else {
        this.held.set(mote.owner, held);
      }
      this.spare.push(mote);
    }
  }
}
