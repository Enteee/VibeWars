import { describe, expect, it } from "vitest";

import {
  DEATH_SECONDS,
  DUST_SECONDS,
  FLASH_SECONDS,
  MAX_REACTIONS,
  RESPAWN_SECONDS,
  decayReactions,
  deathProgress,
  dustSpeck,
  flashAmount,
  mixColour,
  respawnColumnAlpha,
  respawnRing,
  respawnScale,
  slideAway,
  slideOffset,
  startReaction,
} from "./body-reactions.js";

describe("hit flash", () => {
  const flash = { tint: 0.55, slide: { x: 3, y: 0 } };

  it("is full at the blow and gone at 0.12 s", () => {
    expect(flashAmount({ ...flash, ageSeconds: 0 })).toBeCloseTo(0.55);
    expect(flashAmount({ ...flash, ageSeconds: FLASH_SECONDS })).toBe(0);
  });

  it("slides out and returns to nothing", () => {
    expect(slideOffset({ ...flash, ageSeconds: 0 }).x).toBeCloseTo(0);
    expect(slideOffset({ ...flash, ageSeconds: FLASH_SECONDS / 2 }).x).toBeCloseTo(3);
    expect(Math.abs(slideOffset({ ...flash, ageSeconds: FLASH_SECONDS }).x)).toBeLessThan(1e-9);
  });

  it("slides away from the source by the given pixels, and not at all without one", () => {
    expect(slideAway({ x: 10, y: 0 }, { x: 0, y: 0 }, 3)).toEqual({ x: 3, y: 0 });
    expect(slideAway({ x: 0, y: 0 }, { x: 0, y: 0 }, 3)).toEqual({ x: 0, y: 0 });
    expect(slideAway({ x: 10, y: 0 }, undefined, 3)).toEqual({ x: 0, y: 0 });
  });

  it("restarts on a repeat hit instead of stacking", () => {
    const list = [{ id: "a", ageSeconds: 0.1 }];
    startReaction(list, { id: "a", ageSeconds: 0 });
    startReaction(list, { id: "b", ageSeconds: 0 });
    expect(list).toEqual([
      { id: "a", ageSeconds: 0 },
      { id: "b", ageSeconds: 0 },
    ]);
  });
});

describe("death", () => {
  it("drains fully at 0.45 s", () => {
    expect(deathProgress(0, DEATH_SECONDS)).toBe(0);
    expect(deathProgress(DEATH_SECONDS, DEATH_SECONDS)).toBe(1);
    expect(deathProgress(10, DEATH_SECONDS)).toBe(1);
  });

  it("mixes a colour toward another", () => {
    expect(mixColour(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    expect(mixColour(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });

  it("lays six specks that fade by 0.4 s", () => {
    const at = { x: 0, y: 0 };
    expect(dustSpeck(0, at, 10, 0).alpha).toBeGreaterThan(0.5);
    expect(dustSpeck(0, at, 10, DUST_SECONDS).alpha).toBe(0);
    expect(dustSpeck(3, at, 10, 0).x).toBeLessThan(0);
  });
});

describe("respawn", () => {
  it("rises from a small body to its own size", () => {
    expect(respawnScale(0, RESPAWN_SECONDS)).toBeLessThan(1);
    expect(respawnScale(RESPAWN_SECONDS, RESPAWN_SECONDS)).toBe(1);
  });

  it("widens the ring from 18 to 34 and fades it", () => {
    expect(respawnRing(0, RESPAWN_SECONDS)).toEqual({ radius: 18, alpha: 0.7 });
    expect(respawnRing(RESPAWN_SECONDS, RESPAWN_SECONDS)).toEqual({ radius: 34, alpha: 0 });
  });

  it("fades the light column out by 0.4 s", () => {
    expect(respawnColumnAlpha(0)).toBe(0.5);
    expect(respawnColumnAlpha(0.4)).toBe(0);
  });
});

describe("the list", () => {
  it("drops what has run its time", () => {
    const list = [
      { id: "a", ageSeconds: 0.1 },
      { id: "b", ageSeconds: 0 },
    ];
    decayReactions(list, 0.05, 0.12);
    expect(list.map((item) => item.id)).toEqual(["b"]);
  });

  it("holds its cap, losing the oldest", () => {
    const list = Array.from({ length: MAX_REACTIONS + 5 }, (_, i) => ({
      id: String(i),
      ageSeconds: 0,
    }));
    decayReactions(list, 0, 1);
    expect(list).toHaveLength(MAX_REACTIONS);
    expect(list[0]?.id).toBe("5");
  });
});
