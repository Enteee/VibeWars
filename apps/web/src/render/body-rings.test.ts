import { describe, expect, it } from "vitest";

import { STATUS_DEFINITIONS, type StatusCategory } from "@vibewars/game-core";

import {
  BODY_RING_WIDTH,
  ENCHANT_MOTES,
  ENCHANT_RING_OFFSET,
  HEX_HALO_FLOOR,
  HEX_HALO_SIDES,
  INVULNERABLE_MIN_ALPHA,
  INVULNERABLE_PULSE_SECONDS,
  INVULNERABLE_RING_OFFSET,
  STANCE_BAND_OFFSET,
  STANCE_STREAKS,
  bodyFlags,
  bodyRings,
  enchantMote,
  hexHalo,
  hexHaloCorner,
  hexHaloTurn,
  invulnerableAlpha,
  invulnerableRing,
  stanceStreak,
  type Mote,
  type Streak,
} from "./body-rings.js";

/** Some status of `category`, so the test does not pin which. */
function anyOf(category: StatusCategory): string {
  const found = Object.values(STATUS_DEFINITIONS).find(
    (definition) => definition.category === category,
  );
  if (found === undefined) {
    throw new Error(`no ${category} status`);
  }
  return found.id;
}

const NONE = { enchanted: false, stanced: false, hexed: false } as const;

describe("bodyFlags (#1117, #3226)", () => {
  it("an enchantment, maintained or not, makes a body enchanted", () => {
    expect(bodyFlags(["armor-boost"])).toEqual({ ...NONE, enchanted: true });
    expect(bodyFlags(["mending"])).toEqual({ ...NONE, enchanted: true });
  });

  it("a stance makes it stanced, a hex hexed, and all three together all three", () => {
    expect(bodyFlags([anyOf("stance")])).toEqual({ ...NONE, stanced: true });
    expect(bodyFlags(["backfire"])).toEqual({ ...NONE, hexed: true });
    expect(bodyFlags(["backfire", anyOf("stance"), "armor-boost"])).toEqual({
      enchanted: true,
      stanced: true,
      hexed: true,
    });
  });

  it("no other category, a form included, and no unknown id, marks a body", () => {
    const others = (
      ["condition", "form", "preparation", "weapon-spell", "skill-effect"] as const
    ).map(anyOf);
    expect(bodyFlags([...others, "no-such-status"])).toEqual(NONE);
  });
});

describe("bodyRings (#1117, #3226)", () => {
  const r = 14;

  it("draws none for neither, and none for a hex: it wears the halo instead", () => {
    expect(bodyRings(r, NONE)).toEqual([]);
    expect(bodyRings(r, { ...NONE, hexed: true })).toEqual([]);
  });

  it("an enchantment is one solid brass ring at r + 3.25", () => {
    const [ring, ...rest] = bodyRings(r, { ...NONE, enchanted: true });
    expect(rest).toEqual([]);
    expect(ring).toMatchObject({
      kind: "enchantment",
      radius: r + ENCHANT_RING_OFFSET,
      colour: 0xe8c27a,
      arcs: [{ from: 0, to: 2 * Math.PI }],
    });
  });

  it("a stance is one solid steel band at r + 1.25, clear of the body", () => {
    const [band, ...rest] = bodyRings(r, { ...NONE, stanced: true });
    expect(rest).toEqual([]);
    expect(band).toMatchObject({
      kind: "stance",
      radius: r + STANCE_BAND_OFFSET,
      colour: 0xdfe7f1,
      arcs: [{ from: 0, to: 2 * Math.PI }],
    });
    expect((band?.radius ?? 0) - (band?.width ?? 0) / 2).toBeGreaterThan(r);
  });

  it("both: the band first, inside, the ring outside, not touching", () => {
    const rings = bodyRings(r, { enchanted: true, stanced: true, hexed: true });
    expect(rings.map((ring) => ring.kind)).toEqual(["stance", "enchantment"]);
    const [band, ring] = rings;
    expect((band?.radius ?? 0) + (band?.width ?? 0) / 2).toBeLessThan(
      (ring?.radius ?? 0) - (ring?.width ?? 0) / 2,
    );
  });

  it("every ring, the shimmer too, stays inside r + 6, clear of the status row and the target ring", () => {
    const rings = [
      ...bodyRings(r, { ...NONE, enchanted: true, stanced: true }),
      invulnerableRing(r),
    ];
    for (const ring of rings) {
      expect(ring.width).toBe(BODY_RING_WIDTH);
      expect(ring.radius + ring.width / 2).toBeLessThanOrEqual(r + 6);
    }
    const [, enchantment, shimmer] = rings;
    expect((enchantment?.radius ?? 0) + BODY_RING_WIDTH / 2).toBeLessThan(
      (shimmer?.radius ?? 0) - BODY_RING_WIDTH / 2,
    );
  });
});

describe("the enchantment's motes (#3226)", () => {
  const r = 14;
  const at = (index: number, now: number, reducedMotion = false): Mote | undefined => {
    const mote = { x: 0, y: 0, radius: 0, alpha: 0 };
    return enchantMote(r, index, now, 0.25, reducedMotion, mote) ? mote : undefined;
  };

  it("leave the ring and rise, fading, each from a point of its own", () => {
    const starts = new Set<string>();
    for (let index = 0; index < ENCHANT_MOTES; index += 1) {
      const now = at(index, 1);
      const later = at(index, 1.1);
      expect(later?.y).toBeLessThan(now?.y ?? 0);
      expect(later?.x).toBeCloseTo(now?.x ?? 0);
      expect(later?.alpha).toBeLessThan(now?.alpha ?? 0);
      starts.add((now?.x ?? 0).toFixed(3));
    }
    expect(starts.size).toBe(ENCHANT_MOTES);
  });

  it("stop under reduced motion: none at all", () => {
    expect(at(0, 1, true)).toBeUndefined();
    expect(at(0, 2, true)).toBeUndefined();
  });
});

describe("the stance's streaks (#3226)", () => {
  const r = 14;
  const at = (index: number, reducedMotion = false): Streak | undefined => {
    const streak = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0 };
    return stanceStreak(r, index, 1, 0, reducedMotion, streak) ? streak : undefined;
  };

  it("trail behind a body moving east, past its band, the middle one longest and brightest", () => {
    const streaks = Array.from({ length: STANCE_STREAKS }, (_, index) => at(index));
    for (const streak of streaks) {
      expect(streak?.x1).toBeLessThan(-r);
      expect(streak?.x2).toBeLessThan(streak?.x1 ?? 0);
    }
    const [middle, left, right] = streaks;
    expect(middle?.y1).toBeCloseTo(0);
    expect(left?.y1).toBeCloseTo(-(right?.y1 ?? 0));
    const length = (streak: Streak | undefined): number =>
      Math.abs((streak?.x2 ?? 0) - (streak?.x1 ?? 0));
    expect(length(middle)).toBeGreaterThan(length(left));
    expect(middle?.alpha).toBeGreaterThan(left?.alpha ?? 1);
  });

  it("stop under reduced motion: none at all", () => {
    expect(at(0, true)).toBeUndefined();
  });
});

describe("the hex halo (#3226)", () => {
  /** The health bar's top above a body's centre, past its radius (arena-scene). */
  const HEALTH_BAR_TOP = 12;
  const corners = (radius: number, turn: number) =>
    Array.from({ length: HEX_HALO_SIDES }, (_, corner) => {
      const out = { x: 0, y: 0 };
      hexHaloCorner(hexHalo(radius), turn, corner, out);
      return out;
    });

  it("floats over the health bar at every turn, as wide as the body", () => {
    for (const radius of [6, 14, 19]) {
      for (const turn of [0, 0.4, 1.3, 2.9]) {
        for (const corner of corners(radius, turn)) {
          expect(-corner.y).toBeGreaterThan(radius + HEALTH_BAR_TOP);
          expect(Math.abs(corner.x)).toBeLessThanOrEqual(radius + 1e-9);
        }
      }
    }
    const lowest = Math.min(...corners(14, 0).map((corner) => -corner.y));
    expect(lowest).toBeCloseTo(14 + HEX_HALO_FLOOR);
  });

  it("is built once per radius", () => {
    expect(hexHalo(14)).toBe(hexHalo(14));
  });

  it("turns slowly, and holds still under reduced motion", () => {
    expect(hexHaloTurn(1, false)).toBeGreaterThan(hexHaloTurn(0.5, false));
    expect(hexHaloTurn(1, false) - hexHaloTurn(0.5, false)).toBeLessThan(Math.PI / 4);
    expect(hexHaloTurn(0.5, true)).toBe(hexHaloTurn(7, true));
  });
});

describe("the invulnerable shimmer (#1233)", () => {
  it("is a solid ring outside the enchantment ring", () => {
    const ring = invulnerableRing(14);
    expect(ring).toMatchObject({
      kind: "invulnerable",
      radius: 14 + INVULNERABLE_RING_OFFSET,
      width: BODY_RING_WIDTH,
      arcs: [{ from: 0, to: 2 * Math.PI }],
    });
    expect(invulnerableRing(14)).toBe(ring);
  });

  it("pulses between its floor and 1, and holds at 1 under reduced motion", () => {
    expect(invulnerableAlpha(0, false)).toBe(1);
    expect(invulnerableAlpha(INVULNERABLE_PULSE_SECONDS / 2, false)).toBeCloseTo(
      INVULNERABLE_MIN_ALPHA,
    );
    expect(invulnerableAlpha(INVULNERABLE_PULSE_SECONDS / 2, true)).toBe(1);
  });
});
