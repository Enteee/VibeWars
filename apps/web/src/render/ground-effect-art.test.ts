import { describe, expect, it } from "vitest";
import {
  DOME_LAYERS,
  DOME_RISE,
  FIRE_GLOW_RINGS,
  FLAME_LAYERS,
  FLAME_TONGUES,
  domeLayer,
  fireGlowRing,
  flameDisc,
  flameTongues,
  type DomeLayer,
  type FlameDisc,
  type GlowRing,
} from "./ground-effect-art.js";
import { FLAME_BASE_COLOUR, FLAME_TIP_COLOUR } from "./ground-effect-look.js";
import { FIRE_LIGHT_REACH } from "./lighting-model.js";

const disc = (): FlameDisc => ({ x: 0, y: 0, radius: 0, colour: 0, alpha: 0 });
const layer = (): DomeLayer => ({ x: 0, y: 0, radius: 0, alpha: 0 });

describe("flameTongues (#4054)", () => {
  it("burns 9 tongues inside the area, back to front", () => {
    const tongues = flameTongues(7, 40);
    expect(tongues).toHaveLength(FLAME_TONGUES);
    expect(FLAME_TONGUES).toBe(9);
    for (const tongue of tongues) {
      expect(Math.hypot(tongue.x, tongue.y)).toBeLessThanOrEqual(40 * 0.85);
    }
    const ys = tongues.map((tongue) => tongue.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it("places them the same for one id, and differently for another", () => {
    expect(flameTongues(7, 40)).toEqual(flameTongues(7, 40));
    expect(flameTongues(8, 40)).not.toEqual(flameTongues(7, 40));
  });
});

describe("flameDisc (#4054)", () => {
  const [tongue] = flameTongues(3, 40);
  if (tongue === undefined) {
    throw new Error("no tongue");
  }

  it("runs from the base colour at its foot to the tip colour at its tip, rising", () => {
    const base = { ...flameDisc(tongue, 0, 0, true, disc()) };
    const tip = flameDisc(tongue, FLAME_LAYERS - 1, 0, true, disc());
    expect(base.colour).toBe(FLAME_BASE_COLOUR);
    expect(base.y).toBe(tongue.y);
    expect(tip.y).toBeLessThan(base.y);
    expect(tip.radius).toBeLessThan(base.radius);
    expect(tip.colour).toBe(FLAME_TIP_COLOUR);
  });

  it("flickers in time, and stands still under reduced motion", () => {
    const top = FLAME_LAYERS - 1;
    const at = (now: number, reduced: boolean): FlameDisc =>
      flameDisc(tongue, top, now, reduced, disc());
    expect(at(0.3, false)).not.toEqual(at(0, false));
    expect(at(0.3, true)).toEqual(at(0, true));
  });
});

describe("fireGlowRing (#4054)", () => {
  const fire = { id: 3, radius: 40 };
  const ring = (index: number, now: number, reducedMotion: boolean): GlowRing =>
    fireGlowRing(fire, index, now, reducedMotion, { radius: 0, alpha: 0 });

  it("reaches as far as a fire's light, then shrinks ring by ring towards the centre", () => {
    const radii = Array.from(
      { length: FIRE_GLOW_RINGS },
      (_, index) => ring(index, 0, false).radius,
    );
    expect(radii[0]).toBeCloseTo(40 * FIRE_LIGHT_REACH);
    for (let index = 1; index < radii.length; index += 1) {
      expect(radii[index]).toBeLessThan(radii[index - 1] ?? 0);
      expect(radii[index]).toBeGreaterThan(0);
    }
  });

  it("flickers in time, and holds steady under reduced motion", () => {
    const alphas = [0, 0.3, 0.6].map((now) => ring(0, now, false).alpha);
    expect(new Set(alphas).size).toBeGreaterThan(1);
    expect(ring(0, 0, true).alpha).toBe(ring(0, 0.3, true).alpha);
  });
});

describe("domeLayer (#4054)", () => {
  it("rises monotonically to about 0.6 of the radius, narrowing as it goes", () => {
    const layers = Array.from({ length: DOME_LAYERS }, (_, index) => ({
      ...domeLayer(50, index, layer()),
    }));
    for (let index = 1; index < layers.length; index += 1) {
      const below = layers[index - 1];
      const above = layers[index];
      expect(above?.y).toBeLessThan(below?.y ?? 0);
      expect(above?.radius).toBeLessThan(below?.radius ?? 0);
    }
    expect(layers[0]).toMatchObject({ y: -0, radius: 50 });
    expect(-(layers.at(-1)?.y ?? 0)).toBeGreaterThan(50 * DOME_RISE * 0.9);
    expect(-(layers.at(-1)?.y ?? 0)).toBeLessThanOrEqual(50 * DOME_RISE);
  });
});
