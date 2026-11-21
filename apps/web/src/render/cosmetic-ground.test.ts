import { describe, expect, it } from "vitest";

import { cosmeticById, type CosmeticEntry } from "../cosmetics/catalog.js";
import { GROUND_ALPHA, GROUND_RADIUS_OF_BODY } from "../cosmetics/check.js";
import type { Painter } from "./body-painter.js";
import {
  FootstepTrails,
  TRAIL_MOTES_PER_BODY,
  TRAIL_MOTES_PER_SCENE,
  TRAIL_SECONDS,
  auraOf,
  paintAura,
  paintMotes,
  type GroundBody,
} from "./cosmetic-ground.js";
import { CHARACTER_BANDS, characterBand, renderOrder } from "./render-order.js";

const R = 16;
const FRAME = 1 / 60;

function entry(id: string): CosmeticEntry {
  const found = cosmeticById(id);
  if (found === undefined) {
    throw new Error(`no cosmetic ${id}`);
  }
  return found;
}

function body(id: string, x: number, y = 0, extra: Partial<GroundBody> = {}): GroundBody {
  return {
    id,
    position: { x, y },
    radius: R,
    layer: 0,
    dead: false,
    cosmetics: { trail: entry("trail-frost"), aura: entry("aura-starlight") },
    ...extra,
  };
}

/** A painter that keeps every fill and stroke it is asked for. */
function recorder(): {
  readonly painter: Painter;
  readonly shapes: { radius: number; alpha: number; x: number; y: number }[];
} {
  const shapes: { radius: number; alpha: number; x: number; y: number }[] = [];
  let alpha = 0;
  const painter: Painter = {
    fillStyle: (_colour, a) => {
      alpha = a;
    },
    lineStyle: (_width, _colour, a) => {
      alpha = a;
    },
    fillCircle: (x, y, radius) => shapes.push({ x, y, radius, alpha }),
    strokeCircle: (x, y, radius) => shapes.push({ x, y, radius, alpha }),
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    strokePath: () => undefined,
    fillPoints: () => undefined,
  };
  return { painter, shapes };
}

/** `trails` stepped over `frames` frames, each body walking `step` a frame along x. */
function walk(trails: FootstepTrails, ids: readonly string[], frames: number, step: number): void {
  for (let frame = 0; frame < frames; frame += 1) {
    trails.step(
      ids.map((id, index) => body(id, frame * step, index * 100)),
      FRAME,
      false,
    );
  }
}

describe("ground cosmetics' place in the order (ADR-0056 §4, #3578)", () => {
  it("sits under every ward, zone and body of its layer, on any map", () => {
    for (const layerCount of [1, 2, 3, CHARACTER_BANDS]) {
      for (let layer = 0; layer < layerCount; layer += 1) {
        const under = renderOrder({ kind: "cosmetic-ground", layer });
        const band = characterBand(layer, layerCount);
        for (const part of ["body", "glyph", "marks", "bar"] as const) {
          expect(under).toBeLessThan(renderOrder({ kind: "character", band, part }));
        }
        expect(under).toBeLessThan(renderOrder({ kind: "ground-effect", layer }));
        expect(under).toBeLessThan(renderOrder({ kind: "zone", layer, part: "ground" }));
        expect(under).toBeLessThan(renderOrder({ kind: "lighting", layer }));
      }
    }
  });
});

describe("a ground aura (#3578)", () => {
  const look = entry("aura-starlight").look;
  if (look.kind !== "aura" || look.ground === null) {
    throw new Error("aura-starlight is no aura");
  }

  it("stays within its reach past the rim and its alpha", () => {
    const { painter, shapes } = recorder();
    for (const now of [0, 0.4, 1.3, 2.9]) {
      paintAura(painter, 100, 50, R, look, now, 0.25, false);
    }
    expect(shapes.length).toBeGreaterThan(look.sparks);
    for (const shape of shapes) {
      const reach = Math.hypot(shape.x - 100, shape.y - 50) + shape.radius;
      expect(reach).toBeLessThanOrEqual(R * (1 + GROUND_RADIUS_OF_BODY) + 1e-9);
      expect(shape.alpha).toBeLessThanOrEqual(GROUND_ALPHA);
    }
  });

  it("holds still under reduced motion, and moves without it", () => {
    const at = (now: number, reduced: boolean) => {
      const { painter, shapes } = recorder();
      paintAura(painter, 0, 0, R, look, now, 0.5, reduced);
      return shapes;
    };
    expect(at(0.7, true)).toEqual(at(2.2, true));
    expect(at(0.7, false)).not.toEqual(at(2.2, false));
  });

  it("is not drawn for a dead body, nor for one wearing none", () => {
    expect(auraOf(body("a", 0))).toBe(look);
    expect(auraOf(body("a", 0, 0, { dead: true }))).toBeUndefined();
    expect(auraOf(body("a", 0, 0, { cosmetics: {} }))).toBeUndefined();
  });
});

describe("a footstep trail (#3578)", () => {
  it("drops motes behind a walking body, and none under one standing still", () => {
    const trails = new FootstepTrails();
    walk(trails, ["still"], 30, 0);
    expect(trails.motes()).toHaveLength(0);
    walk(trails, ["walker"], 30, 2);
    expect(trails.motes().length).toBeGreaterThan(0);
    expect(trails.motes().every((mote) => mote.owner === "walker")).toBe(true);
  });

  it("fades each mote out within its time, and shrinks it as it goes", () => {
    const trails = new FootstepTrails();
    walk(trails, ["walker"], 10, 4);
    const [first] = trails.motes();
    expect(first).toBeDefined();
    const { painter, shapes } = recorder();
    paintMotes(painter, trails.motes());
    expect(shapes.every((shape) => shape.alpha <= GROUND_ALPHA)).toBe(true);
    for (let frame = 0; frame * FRAME <= TRAIL_SECONDS; frame += 1) {
      trails.step([], FRAME, false);
    }
    expect(trails.motes()).toHaveLength(0);
  });

  it("caps the motes of one body and of the scene, reusing the oldest", () => {
    const trails = new FootstepTrails();
    // Far faster than any body walks: a mote every frame, each body.
    walk(trails, ["a"], 60, R * 2);
    expect(trails.motes()).toHaveLength(TRAIL_MOTES_PER_BODY);
    const crowd = Array.from({ length: 40 }, (_, index) => `body-${String(index)}`);
    walk(trails, crowd, 60, R * 2);
    expect(trails.motes()).toHaveLength(TRAIL_MOTES_PER_SCENE);
    for (const id of crowd) {
      expect(trails.motes().filter((mote) => mote.owner === id).length).toBeLessThanOrEqual(
        TRAIL_MOTES_PER_BODY,
      );
    }
  });

  it("leaves no mote across a teleport or a change of layer, and keeps each on its layer", () => {
    const trails = new FootstepTrails();
    trails.step([body("a", 0)], FRAME, false);
    trails.step([body("a", R * 20)], FRAME, false);
    expect(trails.motes()).toHaveLength(0);
    trails.step([body("a", R * 21, 0, { layer: 1 })], FRAME, false);
    expect(trails.motes()).toHaveLength(0);
    trails.step([body("a", R * 22, 0, { layer: 1 })], FRAME, false);
    expect(trails.motes().map((mote) => mote.layer)).toEqual([1]);
  });

  it("leaves nothing under reduced motion, and clears what was left", () => {
    const trails = new FootstepTrails();
    walk(trails, ["a"], 10, 4);
    expect(trails.motes().length).toBeGreaterThan(0);
    trails.step([body("a", 100)], FRAME, true);
    expect(trails.motes()).toHaveLength(0);
    trails.step([body("a", 200)], FRAME, true);
    expect(trails.motes()).toHaveLength(0);
  });

  it("leaves nothing behind a dead body or one wearing no trail", () => {
    const trails = new FootstepTrails();
    for (let frame = 0; frame < 20; frame += 1) {
      trails.step(
        [
          body("dead", frame * 4, 0, { dead: true }),
          body("plain", frame * 4, 100, { cosmetics: {} }),
        ],
        FRAME,
        false,
      );
    }
    expect(trails.motes()).toHaveLength(0);
  });
});

/**
 * The frame cost of 16 bodies in trails and auras (#3578), report-only:
 * with `BENCH_COSMETICS` set, 600 frames stepped and painted into a
 * painter that only counts, the ms per frame printed. No timing assertion.
 */
describe.runIf(process.env.BENCH_COSMETICS !== undefined)("the ground cosmetics bench", () => {
  it("times 16 bodies walking in trails and auras", () => {
    const trails = new FootstepTrails();
    const aura = entry("aura-starlight").look;
    let calls = 0;
    const counter: Painter = {
      fillStyle: () => undefined,
      lineStyle: () => undefined,
      fillCircle: () => (calls += 1),
      strokeCircle: () => (calls += 1),
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      arc: () => undefined,
      strokePath: () => undefined,
      fillPoints: () => undefined,
    };
    const frames = 600;
    const start = performance.now();
    for (let frame = 0; frame < frames; frame += 1) {
      const bodies = Array.from({ length: 16 }, (_, index) =>
        body(`b${String(index)}`, frame * 3, index * 60),
      );
      trails.step(bodies, FRAME, false);
      paintMotes(counter, trails.motes());
      for (const each of bodies) {
        if (aura.kind === "aura") {
          paintAura(counter, each.position.x, each.position.y, R, aura, frame * FRAME, 0, false);
        }
      }
    }
    const ms = (performance.now() - start) / frames;
    console.log(
      `ground cosmetics, 16 bodies: ${ms.toFixed(4)} ms/frame, ${String(Math.round(calls / frames))} shapes/frame`,
    );
    expect(calls).toBeGreaterThan(0);
  });
});
