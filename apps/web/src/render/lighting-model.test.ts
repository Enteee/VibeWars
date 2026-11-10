import { describe, expect, it } from "vitest";

import type { MapLighting } from "@vibewars/game-maps/schema";

import { teamColour } from "./arena-snapshot.js";
import {
  BODY_LIGHT_FLOOR,
  SURFACE_LIGHT_FLOOR,
  bodyTintOf,
  flickerAt,
  lightAt,
  multiplyColour,
  steadyLighting,
} from "./lighting-model.js";

const DARK = { colour: 0xffffff, intensity: 0 };
const TORCH = {
  id: "torch",
  position: { x: 100, y: 100 },
  layer: 0,
  radius: 50,
  colour: 0xff0000,
  intensity: 0.8,
  flicker: 0,
};
const BASE: MapLighting = { ambient: DARK, indoorAmbient: DARK, indoor: [], lights: [] };
const ROOM = { kind: "rect", x: 0, y: 0, width: 50, height: 50 } as const;
const SUN = { directionDeg: 0, elevationDeg: 90, colour: 0xffffff, intensity: 0.9 };
const at = (x: number, y: number): { x: number; y: number } => ({ x, y });

describe("lightAt", () => {
  it("lights a map with no lighting flat", () => {
    expect(lightAt(undefined, at(1, 1), 0, 0)).toEqual({ colour: 0xffffff, intensity: 1 });
  });

  it("falls off from the centre to the edge and is nothing beyond it", () => {
    const lit = { ...BASE, lights: [TORCH] };
    const centre = lightAt(lit, at(100, 100), 0, 0, 0);
    expect(centre.intensity).toBeCloseTo(0.8, 2);
    expect(centre.colour).toBe(0xff0000);
    expect(lightAt(lit, at(125, 100), 0, 0, 0).intensity).toBeCloseTo(0.2, 2);
    expect(lightAt(lit, at(150, 100), 0, 0, 0).intensity).toBe(0);
    expect(lightAt(lit, at(190, 100), 0, 0, 0).intensity).toBe(0);
  });

  it("lights only the light's own layer", () => {
    const lit = { ...BASE, lights: [TORCH] };
    expect(lightAt(lit, at(100, 100), 1, 0, 0).intensity).toBe(0);
  });

  it("uses the indoor ambient inside an indoor shape", () => {
    const lit = {
      ...BASE,
      ambient: { colour: 0xffffff, intensity: 0.9 },
      indoorAmbient: { colour: 0xffffff, intensity: 0.5 },
      indoor: [ROOM],
    };
    expect(lightAt(lit, at(10, 10), 0, 0, 0).intensity).toBeCloseTo(0.5, 5);
    expect(lightAt(lit, at(60, 60), 0, 0, 0).intensity).toBeCloseTo(0.9, 5);
  });

  it("gives no sun indoors, and less the lower it stands", () => {
    const lit = { ...BASE, indoor: [ROOM], sun: SUN };
    expect(lightAt(lit, at(10, 10), 0, 0, 0).intensity).toBe(0);
    expect(lightAt(lit, at(60, 60), 0, 0, 0).intensity).toBeCloseTo(0.9, 5);
    const low = { ...lit, sun: { ...SUN, elevationDeg: 30 } };
    expect(lightAt(low, at(60, 60), 0, 0, 0).intensity).toBeCloseTo(0.45, 5);
  });

  it("clamps to the floor asked for, a body's by default, and to 1", () => {
    expect(lightAt(BASE, at(5, 5), 0, 0).intensity).toBe(BODY_LIGHT_FLOOR);
    expect(lightAt(BASE, at(5, 5), 0, 0, SURFACE_LIGHT_FLOOR).intensity).toBe(SURFACE_LIGHT_FLOOR);
    const blazing = {
      ...BASE,
      lights: [
        { ...TORCH, intensity: 1 },
        { ...TORCH, id: "b" },
      ],
    };
    expect(lightAt(blazing, at(100, 100), 0, 0).intensity).toBe(1);
  });

  it("flickers repeatably, within its range, and differently per light", () => {
    const flame = { ...TORCH, intensity: 1, flicker: 0.5 };
    const lit = { ...BASE, lights: [flame] };
    const seen = [0, 137, 411, 950, 2203, 7001].map(
      (time) => lightAt(lit, at(100, 100), 0, time, 0).intensity,
    );
    expect(seen).toEqual(
      [0, 137, 411, 950, 2203, 7001].map(
        (time) => lightAt(lit, at(100, 100), 0, time, 0).intensity,
      ),
    );
    expect(new Set(seen).size).toBeGreaterThan(1);
    for (const intensity of seen) {
      expect(intensity).toBeGreaterThanOrEqual(0.5);
      expect(intensity).toBeLessThanOrEqual(1);
    }
    const other = { ...BASE, lights: [{ ...flame, id: "other" }] };
    expect(lightAt(other, at(100, 100), 0, 137, 0).intensity).not.toBe(seen[1]);
  });

  it("fills the sample it is given", () => {
    const into = { colour: 0, intensity: 0 };
    expect(lightAt(undefined, at(0, 0), 0, 0, BODY_LIGHT_FLOOR, into)).toBe(into);
  });
});

describe("a body's tint (#2987)", () => {
  const TEAMS = ["ally", "enemy", "third", "self"] as const;
  const channels = (colour: number): number[] => [16, 8, 0].map((s) => (colour >> s) & 0xff);

  it.each([0xff0000, 0x00ff00, 0x0000ff])(
    "keeps every team colour readable under a pure-hue light, %s, in the dark",
    (hue) => {
      const lit = { ...BASE, lights: [{ ...TORCH, colour: hue, intensity: 1 }] };
      const tint = bodyTintOf(lightAt(lit, at(100, 100), 0, 0));
      for (const team of TEAMS) {
        const colour = teamColour(team);
        const shown = channels(multiplyColour(colour, tint));
        channels(colour).forEach((channel, at) => {
          expect(shown[at]).toBeGreaterThanOrEqual(Math.floor(channel * BODY_LIGHT_FLOOR));
        });
      }
    },
  );

  it("is white in full white light", () => {
    const lit = { ...BASE, ambient: { colour: 0xffffff, intensity: 1 } };
    expect(bodyTintOf(lightAt(lit, at(0, 0), 0, 0))).toBe(0xffffff);
  });
});

describe("steadyLighting", () => {
  const lit = { ...BASE, lights: [{ ...TORCH, flicker: 0.6 }] };

  it("holds every light at full, at any time", () => {
    const steady = steadyLighting(lit);
    expect(steady.lights.map((l) => flickerAt(l.id, l.flicker, 1234))).toEqual([1]);
    expect(lightAt(steady, at(100, 100), 0, 1234, 0).intensity).toBeCloseTo(0.8, 2);
  });

  it("is made once per lighting, so a frame allocates nothing", () => {
    expect(steadyLighting(lit)).toBe(steadyLighting(lit));
  });
});
