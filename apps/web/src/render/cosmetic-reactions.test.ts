import { describe, expect, it } from "vitest";

import { COSMETIC_CATALOG, cosmeticById, type CosmeticEntry } from "../cosmetics/catalog.js";
import { GROUND_ALPHA, GROUND_RADIUS_OF_BODY } from "../cosmetics/check.js";
import type { Painter } from "./body-painter.js";
import { DEATH_SECONDS, RESPAWN_SECONDS } from "./body-reactions.js";
import type { GroundBody } from "./cosmetic-ground.js";
import {
  STYLE_MOTES,
  dissolveStyleOf,
  fallSeconds,
  paintStyle,
  returnSeconds,
  spawnStyleOf,
  styleMote,
  type DissolveLook,
  type SpawnLook,
} from "./cosmetic-reactions.js";

const R = 16;

function entry(id: string): CosmeticEntry {
  const found = cosmeticById(id);
  if (found === undefined) {
    throw new Error(`no cosmetic ${id}`);
  }
  return found;
}

function body(extra: Partial<GroundBody> = {}): GroundBody {
  return {
    id: "a",
    position: { x: 0, y: 0 },
    radius: R,
    layer: 0,
    dead: false,
    cosmetics: {},
    ...extra,
  };
}

/** Every point a painter fills, with the alpha it was filled at. */
function recorder(): {
  readonly painter: Painter;
  readonly points: { x: number; y: number; alpha: number }[];
} {
  const points: { x: number; y: number; alpha: number }[] = [];
  let alpha = 0;
  const painter: Painter = {
    fillStyle: (_colour, a) => {
      alpha = a;
    },
    lineStyle: (_width, _colour, a) => {
      alpha = a;
    },
    // A circle's farthest points from the body: its centre pushed out by its radius.
    fillCircle: (x, y, radius) => {
      const d = Math.hypot(x, y);
      points.push({ x: x + (x / d) * radius, y: y + (y / d) * radius, alpha });
    },
    strokeCircle: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    strokePath: () => undefined,
    fillPoints: (shape) => {
      for (const { x, y } of shape) {
        points.push({ x, y, alpha });
      }
    },
  };
  return { painter, points };
}

const STYLES = COSMETIC_CATALOG.flatMap((each) =>
  each.look.kind === "spawn" || each.look.kind === "dissolve" ? [each.look] : [],
);

describe("spawn-in and death dissolve styles (#3580)", () => {
  it("are found on the body that wears them, with their time", () => {
    const plain = body();
    expect(spawnStyleOf(plain)).toBeUndefined();
    expect(returnSeconds(plain)).toBe(RESPAWN_SECONDS);
    expect(fallSeconds(plain)).toBe(DEATH_SECONDS);
    const worn = body({
      cosmetics: { spawn: entry("spawn-petals"), dissolve: entry("dissolve-mist") },
    });
    expect(spawnStyleOf(worn)?.motif).toBe("petals");
    expect(dissolveStyleOf(worn)?.motif).toBe("mist");
    expect(returnSeconds(worn)).toBe(RESPAWN_SECONDS);
    expect(fallSeconds(worn)).toBe(DEATH_SECONDS);
  });

  it.each(STYLES.map((look) => [`${look.kind} ${look.motif}`, look] as const))(
    "%s stays within its reach and alpha, and is gone when its time is",
    (_name, look: SpawnLook | DissolveLook) => {
      const reach = R * (1 + GROUND_RADIUS_OF_BODY);
      for (let step = 0; step <= 20; step += 1) {
        const { painter, points } = recorder();
        paintStyle(painter, look, 0, 0, R, (look.seconds * step) / 20, 0.7, false);
        for (const point of points) {
          expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(reach + 1e-9);
          expect(point.alpha).toBeLessThanOrEqual(GROUND_ALPHA);
        }
        if (step > 0 && step < 20) {
          expect(points.length).toBeGreaterThanOrEqual(STYLE_MOTES);
        } else if (step === 20) {
          expect(points).toEqual([]);
        }
      }
    },
  );

  it.each(STYLES.map((look) => [`${look.kind} ${look.motif}`, look] as const))(
    "%s gathers in for a spawn, leaves for a death",
    (_name, look: SpawnLook | DissolveLook) => {
      const early = styleMote(look, 0, 0, 0, R, look.seconds * 0.2, 0);
      const late = styleMote(look, 0, 0, 0, R, look.seconds * 0.8, 0);
      const inward = Math.hypot(late.x, late.y) < Math.hypot(early.x, early.y);
      expect(inward).toBe(look.kind === "spawn");
    },
  );

  it("draws nothing under reduced motion: the body's own fade is the effect", () => {
    for (const look of STYLES) {
      const { painter, points } = recorder();
      paintStyle(painter, look, 0, 0, R, look.seconds / 2, 0, true);
      expect(points).toEqual([]);
    }
  });
});
