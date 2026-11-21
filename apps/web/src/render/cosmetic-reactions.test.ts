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
          expect(points.length).toBeGreaterThan(0);
        } else if (step === 20) {
          expect(points).toEqual([]);
        }
      }
    },
  );

  it.each(STYLES.map((look) => [`${look.kind} ${look.motif}`, look] as const))(
    "%s gathers in for a spawn, leaves for a death, outside the body",
    (_name, look: SpawnLook | DissolveLook) => {
      for (let i = 0; i < look.motes; i += 1) {
        const path = [0.1, 0.3, 0.5, 0.7, 0.9]
          .map((share) => styleMote(look, i, 0, 0, R, look.seconds * share, 0))
          .filter((mote) => mote.alpha > 0);
        for (const mote of path) {
          expect(Math.hypot(mote.x, mote.y) - mote.size / 2).toBeGreaterThanOrEqual(R - 1e-9);
        }
        const first = path[0];
        const last = path[path.length - 1];
        if (first === undefined || last === undefined || first === last) {
          continue;
        }
        const inward = Math.hypot(last.x, last.y) < Math.hypot(first.x, first.y);
        expect(inward).toBe(look.kind === "spawn");
      }
    },
  );

  /** Where mote `index` of style `id` sits, `share` of the way through its own flight. */
  function along(id: string, index: number, share: number): { x: number; y: number } {
    const { look } = entry(id);
    if (look.kind !== "spawn" && look.kind !== "dissolve") {
      throw new Error(`${id} is no style`);
    }
    const start = (index / look.motes) * 0.45;
    return styleMote(look, index, 0, 0, R, look.seconds * (start + 0.55 * share), 0.3);
  }

  it("moves each motif its own way: light rises, petals and stars fall, ash drifts up", () => {
    // Screen y grows downward: rising is y falling.
    expect(along("spawn-light", 0, 0.9).y).toBeLessThan(along("spawn-light", 0, 0.1).y);
    expect(along("spawn-light", 0, 0.1).y).toBeGreaterThan(0);
    expect(along("spawn-petals", 0, 0.1).y).toBeLessThan(0);
    expect(along("spawn-petals", 0, 0.9).y).toBeGreaterThan(along("spawn-petals", 0, 0.1).y);
    expect(along("spawn-stars", 0, 0.9).y).toBeGreaterThan(along("spawn-stars", 0, 0.1).y);
    expect(along("dissolve-ash", 4, 0.9).y).toBeLessThan(along("dissolve-ash", 4, 0.1).y);
    expect(along("dissolve-stars", 0, 0.9).y).toBeLessThan(along("dissolve-stars", 0, 0.1).y);
  });

  it("swirls the leaves a full turn and more", () => {
    const { look } = entry("spawn-leaves");
    if (look.kind !== "spawn") {
      throw new Error("no spawn");
    }
    // The leaves swirl as one ring, over the whole time.
    const at = (share: number) => styleMote(look, 0, 0, 0, R, look.seconds * share, 0);
    let turned = 0;
    let last = Math.atan2(at(0).y, at(0).x);
    for (let step = 1; step <= 40; step += 1) {
      const { x, y } = at(step / 40);
      const angle = Math.atan2(y, x);
      turned += Math.atan2(Math.sin(angle - last), Math.cos(angle - last));
      last = angle;
    }
    expect(Math.abs(turned)).toBeGreaterThan(Math.PI * 2);
  });

  it("makes a higher tier busier, not only another colour", () => {
    for (const ids of [
      ["spawn-light", "spawn-leaves", "spawn-petals", "spawn-stars"],
      ["dissolve-ash", "dissolve-mist", "dissolve-shards", "dissolve-stars"],
    ]) {
      const motes = ids.map((id) => {
        const { look } = entry(id);
        return look.kind === "spawn" || look.kind === "dissolve" ? look.motes : 0;
      });
      expect([...motes].sort((a, b) => a - b)).toEqual(motes);
      expect(new Set(motes).size).toBe(motes.length);
      expect(Math.max(...motes)).toBeLessThanOrEqual(STYLE_MOTES);
    }
  });

  it("draws nothing under reduced motion: the body's own fade is the effect", () => {
    for (const look of STYLES) {
      const { painter, points } = recorder();
      paintStyle(painter, look, 0, 0, R, look.seconds / 2, 0, true);
      expect(points).toEqual([]);
    }
  });
});
