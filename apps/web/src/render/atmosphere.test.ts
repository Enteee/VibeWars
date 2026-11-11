import { describe, expect, it } from "vitest";

import type { MapAtmosphere } from "@vibewars/game-maps/schema";

import {
  AtmosphereParticles,
  FOG_COLOUR,
  PARTICLE_BUDGET,
  WEATHER_ALPHA,
  fogArtOf,
  fogPuffAt,
  paintParticle,
  type AtmospherePainter,
  type Particle,
} from "./atmosphere.js";

const view = { x: 0, y: 0, width: 1200, height: 800 };
const lit = { on: true, reducedMotion: false };
const plume = (index: number, kind: "smoke" | "steam" = "steam") => ({
  id: `vent-${String(index)}`,
  layer: 0,
  position: { x: 100 + index * 80, y: 400 },
  kind,
});
const atmosphere = (overrides: Partial<MapAtmosphere> = {}): MapAtmosphere => ({
  fog: [],
  plumes: [plume(0)],
  weather: { kind: "rain", intensity: 0.5 },
  ...overrides,
});

/** `particles` stepped `frames` times at 60 fps. */
function run(particles: AtmosphereParticles, frames: number, mode = lit, at = view): void {
  for (let frame = 0; frame < frames; frame += 1) {
    particles.step(1 / 60, at, mode);
  }
}

describe("atmosphere particles (#3032)", () => {
  it(`never holds more than ${String(PARTICLE_BUDGET)}, with every plume and a downpour`, () => {
    const particles = new AtmosphereParticles(
      atmosphere({
        plumes: Array.from({ length: 12 }, (_, index) => plume(index, "smoke")),
        weather: { kind: "rain", intensity: 1 },
      }),
    );
    for (let frame = 0; frame < 600; frame += 1) {
      particles.step(1 / 60, view, lit);
      expect(particles.particles.length).toBeLessThanOrEqual(PARTICLE_BUDGET);
    }
    expect(particles.particles.some((particle) => particle.kind === "smoke")).toBe(true);
  });

  it("makes nothing with lighting off, and drops what it had when it goes off", () => {
    const particles = new AtmosphereParticles(atmosphere());
    run(particles, 60, { on: false, reducedMotion: false });
    expect(particles.particles).toHaveLength(0);
    run(particles, 60);
    expect(particles.particles.length).toBeGreaterThan(0);
    run(particles, 1, { on: false, reducedMotion: false });
    expect(particles.particles).toHaveLength(0);
  });

  it("makes no particle under reduced motion", () => {
    const particles = new AtmosphereParticles(atmosphere());
    run(particles, 120, { on: true, reducedMotion: true });
    expect(particles.particles).toHaveLength(0);
  });

  it("skips a plume well off-screen", () => {
    const particles = new AtmosphereParticles(atmosphere({ weather: null }));
    run(particles, 120, lit, { x: 600, y: 0, width: 600, height: 300 });
    expect(particles.particles).toHaveLength(0);
    run(particles, 120);
    expect(particles.particles.length).toBeGreaterThan(0);
  });

  it("rains more as it pours, and lands rain as ripples", () => {
    const count = (intensity: number): number => {
      const particles = new AtmosphereParticles(
        atmosphere({ plumes: [], weather: { kind: "rain", intensity } }),
      );
      run(particles, 120);
      expect(particles.particles.some((particle) => particle.kind === "ripple")).toBe(true);
      return particles.particles.filter((particle) => particle.kind === "rain").length;
    };
    expect(count(1)).toBeGreaterThan(count(0.5));
  });

  it("draws the same frame from the same steps", () => {
    const frame = (): readonly Particle[] => {
      const particles = new AtmosphereParticles(atmosphere());
      run(particles, 90);
      return particles.particles.map((particle) => ({ ...particle }));
    };
    expect(frame()).toEqual(frame());
  });
});

describe("fog banks (#3032)", () => {
  const bank = {
    layer: 1,
    area: {
      kind: "polygon" as const,
      points: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 200, y: 250 },
      ],
    },
  };

  it("puffs inside the bank, the same on every load", () => {
    const art = fogArtOf(bank, 0);
    expect(art.layer).toBe(1);
    expect(art.puffs.length).toBeGreaterThanOrEqual(3);
    for (const puff of art.puffs) {
      expect(puff.y).toBeGreaterThanOrEqual(100);
      expect(puff.y).toBeLessThanOrEqual(250);
      expect(puff.alpha).toBeLessThanOrEqual(0.26);
    }
    expect(fogArtOf(bank, 0)).toEqual(art);
  });

  it("drifts, and holds still under reduced motion", () => {
    const [puff] = fogArtOf(bank, 0).puffs;
    if (puff === undefined) {
      throw new Error("no puff");
    }
    expect(fogPuffAt(puff, 3, false)).not.toEqual(fogPuffAt(puff, 0, false));
    expect(fogPuffAt(puff, 3, true)).toEqual(fogPuffAt(puff, 0, true));
  });

  it("is cool grey, not poison green", () => {
    expect(FOG_COLOUR).toBe(0xc8d4e4);
  });
});

describe("painting a particle (#3032)", () => {
  it("never covers what is under it more than WEATHER_ALPHA", () => {
    const alphas: number[] = [];
    const painter: AtmospherePainter = {
      fillStyle: (_colour, alpha) => alphas.push(alpha),
      lineStyle: (_width, _colour, alpha) => alphas.push(alpha),
      fillCircle: () => undefined,
      fillEllipse: () => undefined,
      strokeEllipse: () => undefined,
      lineBetween: () => undefined,
      fillRect: () => undefined,
    };
    const particles = new AtmosphereParticles(
      atmosphere({
        plumes: [plume(0, "smoke"), plume(1)],
        weather: { kind: "snow", intensity: 1 },
      }),
    );
    run(particles, 120);
    for (const particle of particles.particles) {
      paintParticle(painter, particle, 0, 1);
    }
    expect(alphas.length).toBeGreaterThan(0);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(WEATHER_ALPHA);
  });
});
