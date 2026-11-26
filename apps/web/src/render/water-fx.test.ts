import { describe, expect, it } from "vitest";

import {
  DROPLET_SECONDS,
  MAX_WATER_DROPLETS,
  MAX_WATER_RINGS,
  SPLASH_DROPLETS_MAX,
  SPLASH_DROPLETS_MIN,
  STILL_RING_SECONDS,
  WAKE_SECONDS,
  WAKE_SPACING,
  WaterFx,
  dropletAt,
  ringAt,
  type WadingBody,
  type WaterAt,
} from "./water-fx.js";

const FRAME = 1 / 60;

/** Shallow water east of x = 0 on layer 0, dry ground west of it. */
const shallowEast: WaterAt = ({ x }, layer) => (layer === 0 && x >= 0 ? "shallow" : undefined);

function body(x: number, y = 0, id = "a"): WadingBody {
  return { id, position: { x, y }, layer: 0, dead: false };
}

/** Walk one body from `from` to `to` along x at 2 u a frame. */
function walk(fx: WaterFx, from: number, to: number, reducedMotion = false): void {
  const sign = Math.sign(to - from);
  for (let x = from; sign * (to - x) >= 0; x += 2 * sign) {
    fx.step([body(x)], shallowEast, FRAME, reducedMotion);
  }
}

describe("WaterFx wake (#4061)", () => {
  it("leaves one ring per WAKE_SPACING waded", () => {
    const fx = new WaterFx();
    let rings = 0;
    const count = (): void => {
      rings = Math.max(rings, fx.rings().length);
    };
    // 400 u in water, in a time far shorter than a ring's life: none fade.
    for (let x = 10; x <= 410; x += 2) {
      fx.step([body(x)], shallowEast, 0.001, false);
      count();
    }
    expect(rings).toBe(400 / WAKE_SPACING);
  });

  it("leaves none on dry ground, and none under reduced motion", () => {
    const dry = new WaterFx();
    walk(dry, -400, -10);
    expect(dry.rings()).toHaveLength(0);
    const still = new WaterFx();
    walk(still, 10, 400, true);
    expect(still.rings()).toHaveLength(0);
  });

  it("fades each ring out over WAKE_SECONDS", () => {
    const fx = new WaterFx();
    walk(fx, 10, 10 + WAKE_SPACING + 2);
    expect(fx.rings()).toHaveLength(1);
    const ring = fx.rings()[0];
    if (ring === undefined) {
      throw new Error("no ring");
    }
    const young = ringAt(ring);
    fx.step([], shallowEast, WAKE_SECONDS / 2, false);
    const older = ringAt(ring);
    expect(older.radius).toBeGreaterThan(young.radius);
    expect(older.alpha).toBeLessThan(young.alpha);
    fx.step([], shallowEast, WAKE_SECONDS, false);
    expect(fx.rings()).toHaveLength(0);
  });

  it("makes no ring for a jump across the water", () => {
    const fx = new WaterFx();
    fx.step([body(10)], shallowEast, FRAME, false);
    fx.step([body(10 + WAKE_SPACING * 5)], shallowEast, FRAME, false);
    expect(fx.rings()).toHaveLength(0);
  });
});

describe("WaterFx splash (#4061)", () => {
  it("throws 6 to 8 droplets and one ring as a body steps into shallow water", () => {
    for (let k = 0; k < 20; k += 1) {
      const fx = new WaterFx();
      // Earlier splashes elsewhere change the seed this one throws with.
      for (let s = 0; s < k; s += 1) {
        fx.splash(1000, 1000, 1, false);
      }
      fx.step([], shallowEast, 1, false);
      walk(fx, -6, 0);
      expect(fx.rings()).toHaveLength(1);
      expect(fx.droplets().length).toBeGreaterThanOrEqual(SPLASH_DROPLETS_MIN);
      expect(fx.droplets().length).toBeLessThanOrEqual(SPLASH_DROPLETS_MAX);
    }
  });

  it("has every droplet back down and gone by DROPLET_SECONDS", () => {
    const fx = new WaterFx();
    fx.splash(0, 0, 0, false);
    const thrown = [...fx.droplets()];
    fx.step([], shallowEast, DROPLET_SECONDS / 2, false);
    expect(thrown.some((droplet) => dropletAt(droplet).y < droplet.y)).toBe(true);
    fx.step([], shallowEast, DROPLET_SECONDS / 2, false);
    expect(fx.droplets()).toHaveLength(0);
  });

  it("does not splash a body first seen already in the water", () => {
    const fx = new WaterFx();
    fx.step([body(20)], shallowEast, FRAME, false);
    expect(fx.rings()).toHaveLength(0);
    expect(fx.droplets()).toHaveLength(0);
  });

  it("is one still ring for STILL_RING_SECONDS under reduced motion", () => {
    const fx = new WaterFx();
    walk(fx, -6, 0, true);
    expect(fx.droplets()).toHaveLength(0);
    const ring = fx.rings()[0];
    if (ring === undefined) {
      throw new Error("no ring");
    }
    const first = ringAt(ring);
    fx.step([], shallowEast, STILL_RING_SECONDS / 2, true);
    expect(ringAt(ring)).toEqual(first);
    fx.step([], shallowEast, STILL_RING_SECONDS / 2, true);
    expect(fx.rings()).toHaveLength(0);
  });
});

describe("WaterFx caps (#4061)", () => {
  it("holds at most MAX_WATER_RINGS and MAX_WATER_DROPLETS, dropping the oldest", () => {
    const fx = new WaterFx();
    for (let k = 0; k < 40; k += 1) {
      fx.splash(k, 0, 0, false);
    }
    expect(fx.rings()).toHaveLength(40);
    expect(fx.droplets()).toHaveLength(MAX_WATER_DROPLETS);
    // The newest splash's droplets are all still there.
    expect(fx.droplets().at(-1)?.x).toBe(39);
    for (let k = 40; k < 100; k += 1) {
      fx.splash(k, 0, 0, false);
    }
    expect(fx.rings()).toHaveLength(MAX_WATER_RINGS);
    expect(fx.rings()[0]?.x).toBe(100 - MAX_WATER_RINGS);
  });

  it("caps a crowd wading at the fountain", () => {
    const fx = new WaterFx();
    const crowd = (x: number): WadingBody[] =>
      Array.from({ length: 16 }, (_, k) => body(x, k * 30, `b${String(k)}`));
    for (let x = -10; x <= 400; x += 4) {
      fx.step(crowd(x), shallowEast, FRAME, false);
      expect(fx.rings().length).toBeLessThanOrEqual(MAX_WATER_RINGS);
      expect(fx.droplets().length).toBeLessThanOrEqual(MAX_WATER_DROPLETS);
    }
    expect(fx.rings()).toHaveLength(MAX_WATER_RINGS);
  });
});
