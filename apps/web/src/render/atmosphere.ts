import { pointInPolygon, type Vec2 } from "@vibewars/game-core";
import type { MapAtmosphere } from "@vibewars/game-maps/schema";

import { shapeOutline } from "./layer-surfaces.js";
import { seeded } from "./zone-painter.js";

/**
 * A map's atmosphere (#3032): fog banks, smoke and steam plumes, rain and
 * snow. Render only: nothing here reaches the simulation, and none of it
 * hides a body, a name or a ring. Lighting off means none of it; reduced
 * motion holds the fog still and lets nothing fall or rise.
 */

/** The most live particles a map has, its plumes and weather together. */
export const PARTICLE_BUDGET = 400;

/** The most weather particles at intensity 1, ripples included: the rest is the plumes'. */
const WEATHER_MOST = 280;
/** World units round the view a plume still emits from: its puffs rise into sight. */
const PLUME_MARGIN = 120;

export type FogBank = MapAtmosphere["fog"][number];
export type Plume = MapAtmosphere["plumes"][number];
export type Weather = NonNullable<MapAtmosphere["weather"]>;

export type ParticleKind = "smoke" | "steam" | "rain" | "ripple" | "snow";

/** One live particle, in world units, on its layer before its lift. */
export interface Particle {
  readonly kind: ParticleKind;
  readonly layer: number;
  x: number;
  y: number;
  readonly vx: number;
  readonly vy: number;
  age: number;
  readonly life: number;
  /** A puff's radius at birth, a streak's length, a flake's or a ripple's radius. */
  readonly size: number;
  /** A per-particle phase, so flakes sway and puffs wobble out of step. */
  readonly phase: number;
}

/** The world rectangle the camera shows. */
export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Whether atmosphere is drawn at all (Options › Lighting), and whether it may move. */
export interface AtmosphereMode {
  readonly on: boolean;
  readonly reducedMotion: boolean;
}

/** How a plume kind rises: puffs a second, their life, speed and size. */
const PLUME_LOOK: Record<
  Plume["kind"],
  { rate: number; life: number; rise: number; size: number; grow: number }
> = {
  smoke: { rate: 5, life: 2.8, rise: 26, size: 5, grow: 2.4 },
  steam: { rate: 8, life: 1.8, rise: 40, size: 5, grow: 2.6 },
};

function inView(point: Vec2, view: ViewRect, margin: number): boolean {
  return (
    point.x >= view.x - margin &&
    point.y >= view.y - margin &&
    point.x <= view.x + view.width + margin &&
    point.y <= view.y + view.height + margin
  );
}

/**
 * A map's plumes and weather as particles, stepped every frame. Seeded,
 * so the same steps over the same view draw the same frame.
 */
export class AtmosphereParticles {
  private readonly random: () => number;
  private readonly live: Particle[] = [];
  /** Puffs owed to each plume, carried between frames. */
  private readonly owed: number[];

  private readonly atmosphere: MapAtmosphere;

  public constructor(atmosphere: MapAtmosphere, seed = 1) {
    this.atmosphere = atmosphere;
    this.random = seeded(seed);
    this.owed = atmosphere.plumes.map(() => 0);
  }

  public get particles(): readonly Particle[] {
    return this.live;
  }

  /**
   * `dt` seconds on, with the camera on `view`. Plumes go first, so a
   * downpour never starves a vent of its smoke.
   */
  public step(dt: number, view: ViewRect, mode: AtmosphereMode): void {
    if (!mode.on || mode.reducedMotion) {
      this.live.length = 0;
      this.owed.fill(0);
      return;
    }
    this.age(dt, view);
    this.emitPlumes(dt, view);
    this.emitWeather(view);
  }

  private age(dt: number, view: ViewRect): void {
    const landed: Particle[] = [];
    let kept = 0;
    for (const particle of this.live) {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const weather = particle.kind === "rain" || particle.kind === "snow";
      if (particle.age < particle.life && (!weather || inView(particle, view, 0))) {
        this.live[kept] = particle;
        kept += 1;
      } else if (particle.kind === "rain" && particle.age >= particle.life) {
        landed.push(particle);
      }
    }
    this.live.length = kept;
    for (const drop of landed) {
      this.ripple(drop);
    }
  }

  /** Where a streak lands, a small ring spreads on the ground. */
  private ripple(drop: Particle): void {
    if (this.live.length >= PARTICLE_BUDGET) {
      return;
    }
    this.live.push({
      kind: "ripple",
      layer: drop.layer,
      x: drop.x,
      y: drop.y,
      vx: 0,
      vy: 0,
      age: 0,
      life: 0.5,
      size: 3 + this.random() * 3,
      phase: 0,
    });
  }

  private emitPlumes(dt: number, view: ViewRect): void {
    this.atmosphere.plumes.forEach((plume, index) => {
      const look = PLUME_LOOK[plume.kind];
      if (!inView(plume.position, view, PLUME_MARGIN)) {
        this.owed[index] = 0;
        return;
      }
      let owed = (this.owed[index] ?? 0) + look.rate * dt;
      while (owed >= 1 && this.live.length < PARTICLE_BUDGET) {
        owed -= 1;
        this.live.push({
          kind: plume.kind,
          layer: plume.layer,
          x: plume.position.x + (this.random() - 0.5) * 4,
          y: plume.position.y - 4,
          vx: (this.random() - 0.5) * 10,
          vy: -look.rise * (0.8 + this.random() * 0.4),
          age: 0,
          life: look.life * (0.8 + this.random() * 0.4),
          size: look.size * (0.8 + this.random() * 0.4),
          phase: this.random() * Math.PI * 2,
        });
      }
      this.owed[index] = Math.min(owed, 1);
    });
  }

  private emitWeather(view: ViewRect): void {
    const weather = this.atmosphere.weather;
    if (weather === null) {
      return;
    }
    const target = Math.round(WEATHER_MOST * weather.intensity);
    let count = this.live.filter(
      (particle) => particle.kind === "rain" || particle.kind === "snow",
    ).length;
    while (count < target && this.live.length < PARTICLE_BUDGET) {
      count += 1;
      this.live.push(weather.kind === "rain" ? this.raindrop(view) : this.flake(view));
    }
  }

  /** A slanted streak somewhere in view, falling for under a second. */
  private raindrop(view: ViewRect): Particle {
    return {
      kind: "rain",
      layer: 0,
      x: view.x + this.random() * view.width,
      y: view.y + this.random() * view.height,
      vx: -70,
      vy: 420,
      age: 0,
      life: 0.25 + this.random() * 0.35,
      size: 9 + this.random() * 7,
      phase: 0,
    };
  }

  /** A flake 1 to 2.6 px across, drifting down and swaying for a few seconds. */
  private flake(view: ViewRect): Particle {
    return {
      kind: "snow",
      layer: 0,
      x: view.x + this.random() * view.width,
      y: view.y + this.random() * view.height,
      vx: -6 + this.random() * 12,
      vy: 22 + this.random() * 20,
      age: 0,
      life: 3 + this.random() * 3,
      size: 0.5 + this.random() * 0.8,
      phase: this.random() * Math.PI * 2,
    };
  }
}

/** Fog's cool pale grey (docs/art/3030-world-elements.md): not acid green, which is poison. */
export const FOG_COLOUR = 0xc8d4e4;
const SMOKE_COLOUR = 0x8c8a86;
const STEAM_COLOUR = 0xf4f6f8;
const RAIN_COLOUR = 0xbcd4f0;
const SNOW_COLOUR = 0xffffff;
const VENT_STONE = 0x6b6459;
const VENT_MOUTH = 0x1d1b19;
/** The most a weather mark covers what is under it (§6 rule 3): a body always shows through. */
export const WEATHER_ALPHA = 0.6;
/** The paler top of a fog puff, where the sky lights it. */
const FOG_CROWN = 0xe6edf5;
/** How many soft rings a fog puff is drawn in. */
const FOG_RINGS = 4;
/** Seconds a fog puff takes round its drift. */
const FOG_DRIFT_SECONDS = 11;
/** World units a fog puff wanders from its place. */
const FOG_DRIFT = 7;

/** One puff of a fog bank, at rest. */
export interface FogPuff {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alpha: number;
  readonly phase: number;
}

/** A fog bank's puffs, scattered once. */
export interface FogArt {
  readonly layer: number;
  readonly puffs: readonly FogPuff[];
}

/** `bank`'s puffs, the `index`th on its map: about one per 1200 square units, 3 to 24. */
export function fogArtOf(bank: FogBank, index: number): FogArt {
  const outline = shapeOutline(bank.area);
  const xs = outline.map((corner) => corner.x);
  const ys = outline.map((corner) => corner.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  const random = seeded((index + 1) * 104729 + Math.round(left) * 31 + Math.round(top));
  const count = Math.max(3, Math.min(24, Math.round((width * height) / 1200)));
  const puffs: FogPuff[] = [];
  for (let tries = 0; puffs.length < count && tries < count * 20; tries += 1) {
    const at = { x: left + random() * width, y: top + random() * height };
    if (pointInPolygon(at, outline)) {
      puffs.push({
        ...at,
        radius: Math.min(14 + random() * 14, width / 2, height / 2) + 8,
        alpha: 0.18 + random() * 0.08,
        phase: random() * Math.PI * 2,
      });
    }
  }
  return { layer: bank.layer, puffs };
}

/** Where `puff` has drifted to at render time `now`; at rest under reduced motion. */
export function fogPuffAt(puff: FogPuff, now: number, reducedMotion: boolean): Vec2 {
  if (reducedMotion) {
    return puff;
  }
  const turn = (now / FOG_DRIFT_SECONDS) * Math.PI * 2 + puff.phase;
  return { x: puff.x + Math.sin(turn) * FOG_DRIFT, y: puff.y + Math.cos(turn) * FOG_DRIFT * 0.5 };
}

/** The few drawing calls atmosphere needs, in Phaser `Graphics` terms: colours are 0xRRGGBB. */
export interface AtmospherePainter {
  fillStyle(colour: number, alpha: number): unknown;
  lineStyle(width: number, colour: number, alpha: number): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  fillEllipse(x: number, y: number, width: number, height: number): unknown;
  strokeEllipse(x: number, y: number, width: number, height: number): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
}

/**
 * A fog bank `lift` world units up: each puff a soft disc with a paler
 * crown up and to the left, where the sky lights it, so the bank reads as
 * haze with body rather than a flat tint.
 */
export function paintFog(
  painter: AtmospherePainter,
  art: FogArt,
  lift: number,
  now: number,
  reducedMotion: boolean,
): void {
  for (const puff of art.puffs) {
    const at = fogPuffAt(puff, now, reducedMotion);
    const y = at.y - lift;
    // Rings shrinking inward: the puff is densest at its heart, its edge melts away.
    for (let ring = 0; ring < FOG_RINGS; ring += 1) {
      painter.fillStyle(FOG_COLOUR, puff.alpha / FOG_RINGS);
      painter.fillCircle(at.x, y, puff.radius * (1 - ring * 0.2));
    }
    painter.fillStyle(FOG_CROWN, puff.alpha * 0.3);
    painter.fillCircle(at.x - puff.radius * 0.2, y - puff.radius * 0.25, puff.radius * 0.45);
  }
}

/** The stone vent a plume rises from: a rim, its dark mouth and the lip's light edge. */
export function paintVent(
  painter: AtmospherePainter,
  plume: Plume,
  lift: number,
  line: number,
): void {
  const { x } = plume.position;
  const y = plume.position.y - lift;
  painter.fillStyle(0x000000, 0.25);
  painter.fillEllipse(x + 1.5, y + 2.5, 22, 10);
  painter.fillStyle(VENT_STONE, 1);
  painter.fillEllipse(x, y, 20, 10);
  painter.fillStyle(VENT_MOUTH, 1);
  painter.fillEllipse(x, y - 0.5, 12, 5);
  painter.lineStyle(line, 0xa39a8b, 0.8);
  painter.strokeEllipse(x, y, 20, 10);
}

/**
 * One particle; a plume's `lift` world units up. Smoke greys, grows and
 * thins as it rises; steam whitens and fades; rain is a slanted streak
 * and a ripple where it lands; snow a small flake swaying as it falls.
 */
export function paintParticle(
  painter: AtmospherePainter,
  particle: Particle,
  lift: number,
  line: number,
): void {
  const t = particle.age / particle.life;
  switch (particle.kind) {
    case "smoke":
    case "steam": {
      const grow = PLUME_LOOK[particle.kind].grow;
      const radius = particle.size * (1 + (grow - 1) * t);
      const wobble = Math.sin(particle.age * 2.2 + particle.phase) * radius * 0.3;
      const fade = particle.kind === "smoke" ? 0.55 * (1 - t) : 0.6 * (1 - t) * (1 - t);
      const colour = particle.kind === "smoke" ? SMOKE_COLOUR : STEAM_COLOUR;
      painter.fillStyle(colour, Math.min(fade, WEATHER_ALPHA));
      painter.fillCircle(particle.x + wobble, particle.y - lift, radius);
      return;
    }
    case "rain": {
      const speed = Math.hypot(particle.vx, particle.vy);
      const dx = (particle.vx / speed) * particle.size;
      const dy = (particle.vy / speed) * particle.size;
      painter.lineStyle(line, RAIN_COLOUR, 0.5);
      painter.lineBetween(particle.x - dx, particle.y - dy, particle.x, particle.y);
      return;
    }
    case "ripple": {
      const radius = particle.size * (0.5 + t);
      painter.lineStyle(line, RAIN_COLOUR, 0.45 * (1 - t));
      painter.strokeEllipse(particle.x, particle.y, radius * 2, radius);
      return;
    }
    case "snow": {
      const sway = Math.sin(particle.age * 1.6 + particle.phase) * 4;
      painter.fillStyle(
        SNOW_COLOUR,
        WEATHER_ALPHA * Math.min(1, (particle.life - particle.age) * 2),
      );
      painter.fillCircle(particle.x + sway, particle.y, particle.size * 2 * line);
      return;
    }
  }
}

/** Rain's faint dark wash over the view, deeper as it pours; snow has none. */
export function paintWeatherWash(
  painter: AtmospherePainter,
  weather: Weather,
  view: ViewRect,
): void {
  if (weather.kind === "rain" && weather.intensity > 0) {
    painter.fillStyle(0x0a1422, 0.1 * weather.intensity);
    painter.fillRect(view.x, view.y, view.width, view.height);
  }
}
